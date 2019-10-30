
/************************************
* Extract historic KW Data and send to Gsheet and BQ
* Version 2.0
* 20/08/2019
* Written By: Pablo Marco
*
* Goal: Every hour, extract KW data and send to a GSheet repository
* to be used in future algorithms
* ChangeLog:
*  	2.0.
*     Add capacity to send to BQ, too
*     Add account number in the uniqueId
*
**************************************/


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
//Options

var sendInfoToGSheets = "NO";
// If "YES", will send infor to gSheets. Otherwise, will not

var tempDataFile = "HourlyDataBQ.txt";
// This name is used to create a file in your Google Drive to store today's performance so far,
// for reference the next time the script is run.

var spreadsheetUrl = "https://docs.google.com/spreadsheets/d/1b3Kgt3k1f_h-Ez8dFjvrS64IDjzTdeiO4s2gKlA5DD8/edit#gid=0";
//Set this if you have the url of a spreadsheet you want to update

var sheetName = "Hourly Data";
// Name of the sheet in the gSheet where we will keep the data

var campaignNameDoesNotContain = [];
// Use this if you want to exclude some campaigns. Case insensitive.
// For example ["Brand"] would ignore any campaigns with 'brand' in the name,
// while ["Brand","Competitor"] would ignore any campaigns with 'brand' or
// 'competitor' in the name.
// Leave as [] to not exclude any campaigns.

var campaignNameContains = [];
// Use this if you only want to look at some campaigns.  Case insensitive.
// For example ["Brand"] would only look at campaigns with 'brand' in the name,
// while ["Brand","Generic"] would only look at campaigns with 'brand' or 'generic'
// in the name.
// Leave as [] to include all campaigns.


// Options for BigQuery
var bqProjectId = 'accom-250309';
// Name of the BigQuery Project

var bqDataSetId = 'GoogleAds';
// Name of the Data Set

var bqTableDaily = 'DailyData';
var bqTableHourly = 'HourlyData';
// Name of the two tables where we will store the data

// Impose a limit on the size of BQ inserts: 10MB - 512Kb for overheads.
var MAX_INSERT_SIZE = 10 * 1024 * 1024 - 512 * 1024;

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
// Function MAIN
function main() {

  // Define the symbols we will use for joining
  var fieldJoin = ",";
  var lineJoin = "$";
  var idJoin = "#";

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // CHECK THAT THE FILES WE WILL USE ARE WORKING PROPERLY

  //Check if the temporary datafile exists, and create it if it does not

  var files = DriveApp.getFilesByName(tempDataFile);
  if (!files.hasNext()) {
    var file = DriveApp.createFile(tempDataFile,"\n");
    Logger.log("File '" + tempDataFile + "' has been created.");
  } else {
    var file = files.next();
    if (files.hasNext()) {
      Logger.log("Error - more than one file named '" + tempDataFile + "'");
      return;
    }
    Logger.log("File '" + tempDataFile + "' has been read.");
  }

  // Check the spreadsheet URL works
  var spreadsheet = checkSpreadsheet(spreadsheetUrl, "the spreadsheet");

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // DEFINE STRUCTURE OF THE OBJECT

  var allData = {}
/*
     UniqueId1: {
       LastHour: {CpcMax: , Impressions: , AveragePosition: , Clicks: , AverageCpc: , Conversions:, Cost: },
       ThisHour: {CpcMax: , Impressions: , AveragePosition: , Clicks: , AverageCpc: , Conversions:, Cost:},
       Kw: , AccountName: , CampaignName: , AdGroupName: , KwStatus: }
*/
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // CREATE THE GADS REPORT WE WILL USE TO EXTRACT THE DATA

  // Get the Ids of the campaigns of the Kws we want to check
  var campaignIds = getCampaignIds();


  // Define the columns of the report query in GAds
  var cols = ['AccountDescriptiveName', 'CampaignName', 'AdGroupId','AdGroupName', 'Id','Criteria',
              'KeywordMatchType','IsNegative','CpcBid', 'Impressions',
              'Clicks', 'AverageCpc', 'AveragePosition', 'Cost',
              'Status', 'CampaignStatus', 'AdGroupStatus'];

  // Define the GAds report type that we will use
  var reportType = 'KEYWORDS_PERFORMANCE_REPORT';

  // Define the conditions of the query
  var queryConditions = "CampaignId IN [" + campaignIds.join(",") + "]";

  // Define the date range for the report
  var dateGadsReport = 'TODAY';

  // Define the query
  var query = 'SELECT ' + cols.join(',') +
              ' FROM ' + reportType +
              ' WHERE ' + queryConditions +
              ' DURING ' + dateGadsReport;

  // Define the report
  var report = AdWordsApp.report(query);

  Logger.log("The GAds report has been created");



  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // POPULATE THE OBJECT WITH HE DATA FROM THE REPORT

  var rows = report.rows();

  // Start the iteration on all the rows
  while(rows.hasNext()){
    var row = rows.next();

    // Define uniqueId, unique identifier for the KWs
    // First, extract the accountID. Then, join it to AdG and KWId
    var accountId = AdWordsApp.currentAccount().getCustomerId()
    var uniqueId = accountId + idJoin + row['AdGroupId'] + idJoin + row['Id'];

    // Create the object unique Id
    allData[uniqueId] = {};


    // Create and populate the properties unique to each UniqueId
    allData[uniqueId]['Kw'] =  (row.KeywordMatchType === 'Exact') ? '['+row.Criteria+']' :
                               (row.KeywordMatchType === 'Phrase') ? '"'+row.Criteria+'"' :
                               row.Criteria;

    allData[uniqueId]['AccountName'] = row['AccountDescriptiveName'];
    allData[uniqueId]['CampaignName'] = row['CampaignName'];
    allData[uniqueId]['AdGroupName'] = row['AdGroupName'];

    // Identify if the KW is active or non-active and write it
    if (row['Status'] == 'enabled' && row['CampaignStatus'] == 'enabled' &&
        row['AdGroupStatus'] == 'enabled') {
            allData[uniqueId]['KwStatus'] = 'Active';
    }
    else {
            allData[uniqueId]['KwStatus'] = 'Non-Active';
         }

    // Create the object "ThisHour" and populate it
    allData[uniqueId]['ThisHour'] = {};
    allData[uniqueId]['ThisHour']['CpcMax'] = parseFloat(row['CpcBid'].replace(/,/g,""),10);
    allData[uniqueId]['ThisHour']['Impressions'] = parseFloat(row['Impressions'].replace(/,/g,""),10);
    allData[uniqueId]['ThisHour']['AveragePosition'] = parseFloat(row['AveragePosition'].replace(/,/g,""),10);
    allData[uniqueId]['ThisHour']['Clicks'] = parseFloat(row['Clicks'].replace(/,/g,""),10);
    allData[uniqueId]['ThisHour']['AverageCpc'] = parseFloat(row['AverageCpc'].replace(/,/g,""),10);
    allData[uniqueId]['ThisHour']['Cost'] = parseFloat(row['Cost'].replace(/,/g,""),10);

  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // KEEP POPULATING THE OBJECT WITH THE DATA FROM THE REPORT

    // Calculate Current Hour
    var currentHour = parseInt(Utilities.formatDate(new Date(), AdWordsApp.currentAccount().getTimeZone(), "HH"), 10);

    // Extract the information from the Data File and populate our object
    if (currentHour != 0) {
      var data = file.getBlob().getDataAsString(); // Extract info from the file

      // Transform the string into an array with items where there were "Linejoin"
      var data = data.split(lineJoin);
      // Iterate in each element of the vector (lines)
      for(var i = 0; i < data.length; i++){
        // Split each line (an array) into a vector composed by the different fields
        data[i] = data[i].split(fieldJoin);

        // Populate "Last Hour"
        var uniqueId = data[i][0]; // First field is uniqueId
        if(allData.hasOwnProperty(uniqueId)){
          allData[uniqueId]['LastHour'] = {};
          allData[uniqueId]['LastHour']['CpcMax'] = parseFloat(data[i][1],10);
          allData[uniqueId]['LastHour']['Impressions'] = parseFloat(data[i][2],10);
          allData[uniqueId]['LastHour']['AveragePosition'] = parseFloat(data[i][3],10);
          allData[uniqueId]['LastHour']['Clicks'] = parseFloat(data[i][4],10);
          allData[uniqueId]['LastHour']['AverageCpc'] = parseFloat(data[i][5],10);
          allData[uniqueId]['LastHour']['Cost'] = parseFloat(data[i][6],10);
        }
      }
    }

Logger.log("Object with data from gAds report has been created");



  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // UPDATE THE TEXT FILE

  Logger.log("Writing Text file with temporary data.");

  //Create the array where we will keep the info to send to the texy file
  var results = [];

  // Populate the array
  for(var uniqueId in allData){
    var resultsRow = [
        uniqueId,
        allData[uniqueId]['ThisHour']['CpcMax'],
        allData[uniqueId]['ThisHour']['Impressions'],
        allData[uniqueId]['ThisHour']['AveragePosition'],
        allData[uniqueId]['ThisHour']['Clicks'],
        allData[uniqueId]['ThisHour']['AverageCpc'],
        allData[uniqueId]['ThisHour']['Cost']
    ];

    // Transform the array of all fields in each KW into a string divided by "fieldjoin"
    results.push(resultsRow.join(fieldJoin));
  }

  // Transform the array of all Kws into a string divided by "linejoin"
  resultsString = results.join(lineJoin);

  // Delete all info in the file and replace with the new resultsString
  file.setContent(resultsString);

  Logger.log("Finished writing the file.");



  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // TRANSFORM THE OBJECT INTO A MATRIX TO MAKE PRINTING TO GSHEET EASY
  // WE WILL ADD SOME EXTRA INFORMATION RELATED TO DATES
  // We will create a single row for each KW

  // Calculate the date of today
  var now = new Date();
  var dateToday = Utilities.formatDate(now, AdWordsApp.currentAccount().getTimeZone(), "yyyy-MM-dd");
  var monthToday = Utilities.formatDate(now, AdWordsApp.currentAccount().getTimeZone(), "MM");
  var weekDayToday = Utilities.formatDate(now, AdWordsApp.currentAccount().getTimeZone(), "u");
  var hourToday = Utilities.formatDate(now, AdWordsApp.currentAccount().getTimeZone(), "H");

  // Define the column headers and data type
  var colHeaders = [];

  colHeaders[0] = ["Date", "DATE"];
  colHeaders[1] = ["Hour", "INTEGER"];
  colHeaders[2] = ["UniqueID", "STRING"];
  colHeaders[3] = ["Keyword", "STRING"];
  colHeaders[4] = ["Status", "STRING"];
  colHeaders[5] = ["AccountName", "STRING"];
  colHeaders[6] = ["CampaignName", "STRING"];
  colHeaders[7] = ["AdGroupName", "STRING"];
  colHeaders[8] = ["Month", "INTEGER"];
  colHeaders[9] = ["WeekDay", "INTEGER"];
  colHeaders[10] = ["CPCMax", "FLOAT"];
  colHeaders[11] = ["Impressions", "INTEGER"];
  colHeaders[12] = ["AvgPosition", "FLOAT"];
  colHeaders[13] = ["Clicks", "INTEGER"];
  colHeaders[14] = ["AverageCPC", "FLOAT"];

    // Create the matrix that will store all the data for printing in GSHEET
    var toPrint = [];

    // Create the counter that will mark the row number
    var i = 0;

    // Start Loop for each UniqueID
    for (uniqueId in allData) {
      // Create the row for the matrix
      toPrint[i] = [];

      // Calculate the most complicated data

      // First the number of impressions counting only the last hour
      var ImpThisHourOnly = allData[uniqueId]['ThisHour']['Impressions'] -
        allData[uniqueId]['LastHour']['Impressions'];


      // Now, the average position only in the last hour.
      //  If ImpThisHourOnly = 0, we write "No"

      if (ImpThisHourOnly == 0) { var avgPosThisHourOnly = 0; }
      else
        {
        var avgPosThisHourOnly = (allData[uniqueId]['ThisHour']['AveragePosition'] * allData[uniqueId]['ThisHour']['Impressions']-
        allData[uniqueId]['LastHour']['AveragePosition'] * allData[uniqueId]['LastHour']['Impressions']) / ImpThisHourOnly;
        }
        // Because of rounding errors, sometimes avgPosThisHourOnly will be <1. In this case just put it to 0
      if (avgPosThisHourOnly < 1) {avgPosThisHourOnly = 0};



      // Now the number of clicks counting only the last hour
      var ClicksThisHourOnly = allData[uniqueId]['ThisHour']['Clicks'] -
        allData[uniqueId]['LastHour']['Clicks'];

      // Now the AverageCPC only in the last hour.
      // If ClicksThisHourOnly = 0, we write "No"

      if (ClicksThisHourOnly == 0) { var avgCpcThisHourOnly = 0; }
      else
        {
        var avgCpcThisHourOnly = (allData[uniqueId]['ThisHour']['Cost'] - allData[uniqueId]['LastHour']['Cost']) /
        ClicksThisHourOnly;
        }

      // Fill the matrix
      toPrint[i][0] = dateToday;
      toPrint[i][1] = hourToday;
      toPrint[i][2] = uniqueId;
      toPrint[i][3] = allData[uniqueId]['Kw'];
      toPrint[i][4] = allData[uniqueId]['KwStatus'];
      toPrint[i][5] = allData[uniqueId]['AccountName'];
      toPrint[i][6] = allData[uniqueId]['CampaignName'];
      toPrint[i][7] = allData[uniqueId]['AdGroupName'];
      toPrint[i][8] = monthToday;
      toPrint[i][9] = weekDayToday;
      toPrint[i][10] = allData[uniqueId]['ThisHour']['CpcMax'];
      toPrint[i][11] = ImpThisHourOnly;
      toPrint[i][12] = avgPosThisHourOnly;
      toPrint[i][13] = ClicksThisHourOnly;
      toPrint[i][14] = avgCpcThisHourOnly;

      i++;

    }

    Logger.log("Matrix has been created");

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // SEND INFORMATION TO GOOGLE SHEET

  if (sendInfoToGSheets == "YES") {
    writeDataToSpreadsheet(spreadsheetUrl, sheetName, toPrint, colHeaders);
    Logger.log("Spreadsheet has been updated");
  }
  else {
    Logger.log("Info was not sent to gSheets");
  }



  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // SEND INFORMATION TO BIGQUERY

  // Create dataset
  createDataset(bqProjectId, bqDataSetId);

  // Create table
  createTable(bqTableHourly, colHeaders);

  // Divide all the data of the matrix into an array of "chunks", divided so they
  // can be better sent to BigQuery
  var csvData = createChunks(toPrint);

  // Now, for each of the chuncks, convert to blob and send to bigQuery
  // Each chink will be uploaded as a "job" with a jobID
  var jobIds = [];
  for (var j = 0; j < csvData.length; j++) {
    // Convert to Blob format.
    var blobData = Utilities.newBlob(csvData[j], 'application/octet-stream');
    // Load data
    var jobId = loadDataToBigquery(blobData);
    jobIds.push(jobId);
  }

  // Now, wait until the job is complete
  waitTillJobsComplete(jobIds);



  Logger.log("Script has been completed");
}

// END OF MAIN FUNCTION
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//




//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
// AUXILIARY FUNCTIONS NON BQ RELATED
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

function getCampaignIds() {
/*
Function to get the IDs of campaigns which match the given options
Return: campaignIds (array)
*/

  var whereStatement = "";
  var whereStatementsArray = [];
  var campaignIds = [];

  for (var i=0; i<campaignNameDoesNotContain.length; i++) {
    whereStatement += "AND CampaignName DOES_NOT_CONTAIN_IGNORE_CASE '" + campaignNameDoesNotContain[i].replace(/"/g,'\\\"') + "' ";
  }

  if (campaignNameContains.length == 0) {
    whereStatementsArray = [whereStatement];
  } else {
    for (var i=0; i<campaignNameContains.length; i++) {
      whereStatementsArray.push(whereStatement + 'AND CampaignName CONTAINS_IGNORE_CASE "' + campaignNameContains[i].replace(/"/g,'\\\"') + '" ');
    }
  }

  for (var i=0; i<whereStatementsArray.length; i++) {
    var campaignReport = AdWordsApp.report(
      "SELECT CampaignId " +
      "FROM   CAMPAIGN_PERFORMANCE_REPORT " +
      "WHERE  CampaignStatus = ENABLED " +
      whereStatementsArray[i] +
      "DURING LAST_30_DAYS");

    var rows = campaignReport.rows();
    while (rows.hasNext()) {
      var row = rows.next();
      campaignIds.push(row['CampaignId']);
    }
  }

  if (campaignIds.length == 0) {
    throw("No campaigns found with the given settings.");
  }

  Logger.log(campaignIds.length + " campaigns were found.");
  return campaignIds;
}

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

function checkSpreadsheet(spreadsheetUrl, spreadsheetName) {
  // Function to check the spreadsheet URL has been entered, and that it works
  // spreadsheetUrl: URL of the spreadsheet we want to check
  // spreadsheetName: Name we will use only if we have an error message
  // RETURN: None

  if (spreadsheetUrl.replace(/[AEIOU]/g,"X") == "https://docs.google.com/YXXR-SPRXXDSHXXT-XRL-HXRX") {
    throw("Problem with " + spreadsheetName + " URL: make sure you've replaced the default with a valid spreadsheet URL.");
  }
  try {
    var spreadsheet = SpreadsheetApp.openByUrl(spreadsheetUrl);
    return spreadsheet;
  } catch (e) {
    throw("Problem with " + spreadsheetName + " URL: '" + e + "'");
  }

  Logger.log("SpreadsheetURL has been verified");
}


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

function writeDataToSpreadsheet(gSheetUrl, sheetName, data, columnHeaders) {
  // Function to write a data formatted as a matrix into a gSheet
  // gSheetUrl: URL of the Google Sheet (String)
  // sheetName: Name of the sheet where we will store the data (String)
  // data: data we want to write (d2 array)
  // columnHeaders: Headers for the columns (d2 array)
  // RETURN: Nothing

  //This is where i am going to store all my data
  var spreadsheet = SpreadsheetApp.openByUrl(gSheetUrl);
  var sheet = spreadsheet.getSheetByName(sheetName);
  Logger.log("Sheet name: " + sheetName);

  if(!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    // If the sheet does not exist, appends the row with the column titles
    var headers = [];
    for (var i = 0; i < columnHeaders.length; i++) {
      headers[i] = columnHeaders[i][0];
    }

    sheet.appendRow(headers);
    Logger.log("We did not find the Sheet named " + sheetName);
  }

  // Here, the scripts compares the number of rows in the sheet (getMaxRows)
  //  to the number of rows with data (getLastRow)
  //  and adds as many new rows as needed
  var lastRow = sheet.getLastRow();
  var numRows = sheet.getMaxRows();
  if((numRows-lastRow) < data.length) {
    sheet.insertRowsAfter((lastRow == 0) ? 1 : lastRow,data.length-numRows+lastRow);
  }

  // Here the script writes the new values in the spreadsheet
  // First it selects a range that starts 1 row after what has been written before
  // Then it adds the information in "toWrite" in that range
  var range = sheet.getRange(lastRow+1,1,data.length,data[0].length);
  range.setValues(data);
}

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
// AUXILIARY FUNCTIONS for BIGQUERY
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
// GROUP OF FUNCTIONS TO CREATE A DATASET IN GQ, ALL LINKED TOGETHER

function createDataset(bqProjectId, bqDataSetId) {
  /*
   Creates a new dataset.
   If a dataset with the same id already exists and the truncate flag
   is set, will truncate the old dataset. If the truncate flag is not
   set, then will not create a new dataset.
   bqProjectId: ID of the Bigquery Project - String
   bqDataSetId: ID of the Bigquery DataSet - String
   Returns: *****
   */

  // Check if the dataset already exists. If it does not, create it
   if (datasetExists(bqProjectId, bqDataSetId)) {
      Logger.log('Dataset %s already exists.  Will not recreate.',
       bqDataSetId);
      return;
    }

  // Create new dataset.
  var dataSet = BigQuery.newDataset();
  dataSet.friendlyName = bqDataSetId;
  dataSet.datasetReference = BigQuery.newDatasetReference();
  dataSet.datasetReference.projectId = bqProjectId;
  dataSet.datasetReference.datasetId = bqDataSetId;

  dataSet = BigQuery.Datasets.insert(dataSet, bqProjectId);
  Logger.log('Created dataset with id %s.', dataSet.id);

}


function datasetExists(bqProjectId, bqDataSetId) {
  /*
   Checks if dataset already exists in project.
   bqProjectId: ID of the Bigquery Project - String
   bqDataSetId: ID of the Bigquery DataSet - String
   Returns: true if dataset already exists - Boolean
   */

  // Get a list of all datasets in project.
  var datasets = BigQuery.Datasets.list(bqProjectId);
  var datasetExists = false;
  // Iterate through each dataset and check for an id match.
  if (datasets.datasets != null) {
    for (var i = 0; i < datasets.datasets.length; i++) {
      var dataset = datasets.datasets[i];
      if (dataset.datasetReference.datasetId == bqDataSetId) {
        datasetExists = true;
        break;
      }
    }
  }
  return datasetExists;
}

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
// GROUP OF FUNCTIONS TO CREATE A TABLE IN GQ, ALL LINKED TOGETHER

/**
 * Creates a new table.
 *
 * If a table with the same id already exists and the truncate flag
 * is set, will truncate the old table. If the truncate flag is not
 * set, then will not create a new table.
 *
 * @param {Object} reportConfig Report configuration including report name,
 *    conditions, and fields.
 */
function createTable(bqTableHourly, colHeaders) {
  if (tableExists(bqTableHourly)) {
      Logger.log('Table %s already exists.  Will not recreate.',
          bqTableHourly);
      return;
    }

  // Create new table.
  var table = BigQuery.newTable();
  var schema = BigQuery.newTableSchema();
  var bigQueryFields = [];

  // Add each field to table schema.
  for (var i = 0; i < colHeaders.length; i++) {
    var bigQueryFieldSchema = BigQuery.newTableFieldSchema();
    bigQueryFieldSchema.description = colHeaders[i][0];
    bigQueryFieldSchema.name = colHeaders[i][0];
    bigQueryFieldSchema.type = colHeaders[i][1];

    bigQueryFields.push(bigQueryFieldSchema);
  }

  schema.fields = bigQueryFields;
  table.schema = schema;
  table.friendlyName = bqTableHourly;

  table.tableReference = BigQuery.newTableReference();
  table.tableReference.datasetId = bqDataSetId;
  table.tableReference.projectId = bqProjectId;
  table.tableReference.tableId = bqTableHourly;

  table = BigQuery.Tables.insert(table, bqProjectId, bqDataSetId);

  Logger.log('Created table with id %s.', table.id);
}

/**
 * Checks if table already exists in dataset.
 *
 * @param {string} tableId The table id to check existence.
 *
 * @return {boolean}  Returns true if table already exists.
 */
function tableExists(tableId) {
  // Get a list of all tables in the dataset.
  var tables = BigQuery.Tables.list(bqProjectId,
      bqDataSetId);
  var tableExists = false;
  // Iterate through each table and check for an id match.
  if (tables.tables != null) {
    for (var i = 0; i < tables.tables.length; i++) {
      var table = tables.tables[i];
      if (table.tableReference.tableId == tableId) {
        tableExists = true;
        break;
      }
    }
  }
  return tableExists;
}

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//


function loadDataToBigquery(data) {
  /**
   * Creates a BigQuery insertJob to load csv data.
   *
   * @param {Blob} data Csv report data as an 'application/octet-stream' blob.
   * @return {string} jobId The job id for upload.
   */

  // Create the data upload job.
  var job = {
    configuration: {
      load: {
        destinationTable: {
          projectId: bqProjectId,
          datasetId: bqDataSetId,
          tableId: bqTableHourly
        },
        nullMarker: '--'
      }
    }
  };

  var insertJob = BigQuery.Jobs.insert(job, bqProjectId, data);
  Logger.log('Load job started for %s. Check on the status of it here: ' +
      'https://bigquery.cloud.google.com/jobs/%s', bqTableHourly,
       bqProjectId);
  return insertJob.jobReference.jobId;
}

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//


function createChunks(toPrint) {
/*
Divide all the data of the matrix into an array of "chunks", divided so they
can be better sent to BigQuery
Returns an array of "chuncks" of .csv data
*/

var chunks = [];
var chunkLen = 0;
var csvRows = [];
var totalRows = 0;

for (var i = 0; i<toPrint.length; i++) {
  // If we have reached the max length for a chunck, create and store.
  if (chunkLen > MAX_INSERT_SIZE) {
    chunks.push(csvRows.join('\n'));
    totalRows += csvRows.length;
    chunkLen = 0;
    csvRows = [];
  }

  // Transform the each row into a csv all with strings
  var rowString = toPrint[i].join(',');
  // Put together all the csv into an array
  csvRows.push(rowString);
  chunkLen += Utilities.newBlob(rowString).getBytes().length + 1;
}

// Now, if we have any csvRows left, add it to the chunks
if (csvRows) {
  totalRows += csvRows.length;
  chunks.push(csvRows.join('\n'));
}
Logger.log('Downloaded ' + bqTableHourly + ' with ' + totalRows +
    ' rows, in ' + chunks.length + ' chunks.');

return chunks;
}

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
// GROUP OF FUNCTIONS TO WAIT AND POLL UNTIL ALL JOBS ARE COMPLETE


function waitTillJobsComplete(jobIds) {
/*
   * Polls until all jobs are 'DONE'.
   *
   * @param {Array.<string>} jobIds The list of all job ids.
*/

  var complete = false;
  var remainingJobs = jobIds;
  while (!complete) {
    if (AdsApp.getExecutionInfo().getRemainingTime() < 5){
      Logger.log('Script is about to timeout, jobs ' + remainingJobs.join(',') +
        ' are still incomplete.');
    }
    remainingJobs = getIncompleteJobs(remainingJobs);
    if (remainingJobs.length == 0) {
      complete = true;
    }
    if (!complete) {
      Logger.log(remainingJobs.length + ' jobs still being processed.');
      // Wait 5 seconds before checking status again.
      Utilities.sleep(5000);
    }
  }
  Logger.log('All jobs processed.');
}

/**
 * Iterates through jobs and returns the ids for those jobs
 * that are not 'DONE'.
 *
 * @param {Array.<string>} jobIds The list of job ids.
 *
 * @return {Array.<string>} remainingJobIds The list of remaining job ids.
 */
function getIncompleteJobs(jobIds) {
  var remainingJobIds = [];
  for (var i = 0; i < jobIds.length; i++) {
    var jobId = jobIds[i];
    var getJob = BigQuery.Jobs.get(bqProjectId, jobId);
    if (getJob.status.state != 'DONE') {
      remainingJobIds.push(jobId);
    }
  }
  return remainingJobIds;
}
