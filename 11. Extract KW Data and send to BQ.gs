/************************************
* Extract historic KW Data and send to BQ
* Version 1.0
* 05/02/2019
* Written By: Pablo Marco
*
* Goal: Every hour, extract KW data and send to a BQ repository
* to be used in future algorithms
* In addition, once a day, it will send the daily info to another BQ Table, too
* ChangeLog:
*  	No changes
*
**************************************/


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
//Options

var dataFile = "Data4BQ.txt";
// This name is used to create a file in your Google Drive to store today's performance so far,
// for reference the next time the script is run.

var campaignNameDoesNotContain = [];
// Use this if you want to exclude some campaigns. Case insensitive.
// For example ["Brand"] would ignore any campaigns with 'brand' in the name,
// while ["Brand","Competitor"] would ignore any campaigns with 'brand' or
// 'competitor' in the name.
// Leave as [] to not exclude any campaigns.

var campaignNameContains = ["Search_Salud_Marca exacta_Mobile"];
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
var bqTableWeekly = 'WeeklyData';
// Name of the two tables where we will store the data



//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
// Function MAIN

function main() {

  // Extract the accountID
  var accountId = AdWordsApp.currentAccount().getCustomerId()

  // Define the symbols we will use for joining
  var fieldJoin = ",";
  var lineJoin = "$";
  var idJoin = "#";

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // CHECK IF THE DATAFILE EXISTS, AND CREATE IT IF IT DOES NOT

  var files = DriveApp.getFilesByName(dataFile);
  if (!files.hasNext()) {
    var file = DriveApp.createFile(dataFile,"\n");
    Logger.log("File '" + dataFile + "' has been created.");
  } else {
    var file = files.next();
    if (files.hasNext()) {
      Logger.log("Error - more than one file named '" + dataFile + "'");
      return;
    }
    Logger.log("File '" + dataFile + "' has been read.");
  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // DEFINE STRUCTURE OF THE OBJECT

  var allData = {
    // UniqueId1: {
    // LastHour: {CpcMax: , Impressions: , AveragePosition: , Clicks: , Cost: },
    // ThisHour: {CpcMax: , Impressions: , AveragePosition: , Clicks: , Cost:},
    // Period: {CpcMax: , Impressions: , AveragePosition: , Clicks: , Cost:}
    // Kw: , AccountName, CampaignName: , AdGroupName: }
  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // CREATE THE GADS REPORT WE WILL USE TO EXTRACT THE DATA

  // Get the Ids of the campaigns of the Kws we want to check
  var campaignIds = getCampaignIds();

  // Define the columns of the report query in GAds
  var cols = ['AccountDescriptiveName', 'CampaignName', 'AdGroupId','AdGroupName', 'Id','Criteria',
              'KeywordMatchType','IsNegative','CpcBid', 'Impressions',
              'Clicks', 'Cost', 'AveragePosition'];

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

    // Create the object "ThisHour" and populate it
    allData[uniqueId]['ThisHour'] = {};
    allData[uniqueId]['ThisHour']['CpcMax'] = parseFloat(row['CpcBid'].replace(/,/g,""),10);
    allData[uniqueId]['ThisHour']['Impressions'] = parseFloat(row['Impressions'].replace(/,/g,""),10);
    allData[uniqueId]['ThisHour']['AveragePosition'] = parseFloat(row['AveragePosition'].replace(/,/g,""),10);
    allData[uniqueId]['ThisHour']['Clicks'] = parseFloat(row['Clicks'].replace(/,/g,""),10);
    allData[uniqueId]['ThisHour']['Cost'] = parseFloat(row['Cost'].replace(/,/g,""),10);

  }


  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // KEEP POPULATING THE OBJECT FROM DATA FROM THE LAST HOUR

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
          allData[uniqueId]['LastHour']['Cost'] = parseFloat(data[i][5],10);
        }
      }
    }


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
// CALCULATE THE DATA FOR THE CURRENT PERIOD (THIS HOUR - LAST HOUR)

  // If Current Hour is 0, for this hour we have unreliable data, because we do
  // not know the activity from the previous loop of the script until midnight.
  // Therefore, we will not calculate
  if (currentHour == 0) {}

  else {
    // Iterate for all unique Ids
    for(var uniqueId in allData) {
      // Calculate only for the uniqueIds where 'LastHour' exists
      if(allData[uniqueId].hasOwnProperty('LastHour')){
        allData[uniqueId]['Period'] = {};
        allData[uniqueId]['Period']['CpcMax'] = allData[uniqueId]['ThisHour']['CpcMax'];
        allData[uniqueId]['Period']['Impressions'] = allData[uniqueId]['ThisHour']['Impressions'] -
          allData[uniqueId]['LastHour']['Impressions'];
        allData[uniqueId]['Period']['AveragePosition'] = calculateAveragePosition (allData[uniqueId]);
        allData[uniqueId]['Period']['Clicks'] = allData[uniqueId]['ThisHour']['Clicks'] -
          allData[uniqueId]['LastHour']['Clicks'];
        allData[uniqueId]['Period']['Cost'] = allData[uniqueId]['ThisHour']['Cost'] -
          allData[uniqueId]['LastHour']['Cost'];
      }
    }
  }

  Logger.log(allData);
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

/*


  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // WE ENTER INTO BQ WORLD!
  // CREATE DATASET AND TABLE

  // Create dataset
  createDataset(bqProjectId, bqDataSetId);






  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // CREATE THE OBJECT TO SEND INFORMATION TO BQ (CHECK IF WE REALLY NEED TO)


  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // SEND INFORMATION TO BQ





*/

}

// END OF MAIN FUNCTION
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//




//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
// FUNCTIONS TO PREPARE THE TRANSFER (NOT RELATED TO BQ)

// Get the IDs of campaigns which match the given options
function getCampaignIds() {
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


function calculateAveragePosition(keywordDataElement){
  /*
  Calculates the average position of the KW
  */
  var lastHourImpressions = keywordDataElement['LastHour']['Impressions'];
  var lastHourAveragePosition = keywordDataElement['LastHour']['AveragePosition'];

  var thisHourImpressions = keywordDataElement['ThisHour']['Impressions'];
  var thisHourAveragePosition = keywordDataElement['ThisHour']['AveragePosition'];

  if(thisHourImpressions == lastHourImpressions){
    return 0;
  }
  else{
    var currentPosition = (thisHourImpressions*thisHourAveragePosition-lastHourImpressions*lastHourAveragePosition)/(thisHourImpressions-lastHourImpressions);
    if (currentPosition < 1) {
      return 0;
    } else {
      return currentPosition;
    }
  }
}

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

   Logger.log("hola");

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
      if (dataset.datasetReference.datasetId == bqProjectId) {
        datasetExists = true;
        break;
      }
    }
  }
  return datasetExists;
}

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
