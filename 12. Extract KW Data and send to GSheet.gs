function remoteScript() {

/************************************
* Extract historic KW Data and send to Gsheet
* Version 1.0
* 05/02/2019
* Written By: Pablo Marco
*
* Goal: Every hour, extract KW data and send to a GSheet repository
* to be used in future algorithms
* ChangeLog:
*  	No changes
*
**************************************/


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
//Options

var tempDataFile = "HourlyDataADESLAS.txt";
// This name is used to create a file in your Google Drive to store today's performance so far,
// for reference the next time the script is run.

var spreadsheetUrl = "https://docs.google.com/spreadsheets/d/1oieopM3CDflfTfdYXv2ZB8hSSo94-A9LDSKK2-JY_e0/edit#gid=357737459";
//Set this if you have the url of a spreadsheet you want to update

var sheetName = "DatosReguladasDKV";
// Name of the sheet in the gSheet where we will keep the data

var labelName = 'Regulada';
// Name of the labels from which we will extract information

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
// Function MAIN





this.main = function () {

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
  // EXTRACT INFORMATION FROM THE LABELS

  // Create vector to Store the Position Labels
  var labelIds = [];

  // Create the text of the condition LabelName
  var labelNameConditionText = "LabelName CONTAINS_IGNORE_CASE " + labelName;


  // Define Label Iterator
  // We will extract the Label IDs of the KW that have the KW "Regulada"
  var labelIterator = AdWordsApp.labels()
  .withCondition("KeywordsCount > 0")
  .withCondition(labelNameConditionText)
  //.withCondition("LabelName CONTAINS_IGNORE_CASE 'Regulada'")
  .get();

  // Store all the KW Labels that have the text "position"
  while (labelIterator.hasNext()) {
    var label = labelIterator.next();
    if (label.getName().substr(0,"regulada".length).toLowerCase() == "regulada") {
      labelIds.push(label.getId());
    }
  }

  if (labelIds.length == 0) {
    Logger.log("Labels with the name: " + labelName + " have NOT been found. The script will stop");
    return;
  }
  Logger.log("Labels with the name: " + labelName + " have been found.");

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // DEFINE STRUCTURE OF THE OBJECT

  var allData = {
    // UniqueId1: {LastHour: {CpcMax: , Impressions: , AveragePosition: , Clicks: , AverageCpc: , Conversions:, Cost: },
    // ThisHour: {CpcMax: , Impressions: , AveragePosition: , Clicks: , AverageCpc: , Conversions:, Cost:},
    // Kw: , CampaignName: , AdGroupName: }
  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // CREATE THE GADS REPORT WE WILL USE TO EXTRACT THE DATA

  // Define the columns of the report query in GAds
  var cols = ['CampaignName', 'AdGroupId','AdGroupName', 'Id','Criteria',
              'KeywordMatchType','IsNegative','CpcBid', 'Impressions',
              'Clicks', 'AverageCpc', 'Conversions', 'AveragePosition', 'Cost'];

  // Define the GAds report type that we will use
  var reportType = 'KEYWORDS_PERFORMANCE_REPORT';

  // Define the conditions of the query
  var queryConditions = 'LabelIds CONTAINS_ANY [' + labelIds.join(fieldJoin) + ']'

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
    var uniqueId = row['AdGroupId'] + idJoin + row['Id'];

    // Create the object unique Id
    allData[uniqueId] = {};


    // Create and populate the properties unique to each UniqueId
    allData[uniqueId]['Kw'] =  (row.KeywordMatchType === 'Exact') ? '['+row.Criteria+']' :
                               (row.KeywordMatchType === 'Phrase') ? '"'+row.Criteria+'"' :
                               row.Criteria;

    allData[uniqueId]['CampaignName'] = row['CampaignName'];
    allData[uniqueId]['AdGroupName'] = row['AdGroupName'];

    // Create the object "ThisHour" and populate it
    allData[uniqueId]['ThisHour'] = {};
    allData[uniqueId]['ThisHour']['CpcMax'] = parseFloat(row['CpcBid'].replace(/,/g,""),10);
    allData[uniqueId]['ThisHour']['Impressions'] = parseFloat(row['Impressions'].replace(/,/g,""),10);
    allData[uniqueId]['ThisHour']['AveragePosition'] = parseFloat(row['AveragePosition'].replace(/,/g,""),10);
    allData[uniqueId]['ThisHour']['Clicks'] = parseFloat(row['Clicks'].replace(/,/g,""),10);
    allData[uniqueId]['ThisHour']['AverageCpc'] = parseFloat(row['AverageCpc'].replace(/,/g,""),10);
    allData[uniqueId]['ThisHour']['Conversions'] = parseFloat(row['Conversions'].replace(/,/g,""),10);
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
          allData[uniqueId]['LastHour']['Conversions'] = parseFloat(data[i][6],10);
          allData[uniqueId]['LastHour']['Cost'] = parseFloat(data[i][7],10);
        }
      }
    }

Logger.log("Object with data from gAds report has been created");
Logger.log(allData);



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
        allData[uniqueId]['ThisHour']['Conversions'],
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

  // Define the column headers
  var colHeaders = [ 'Date', 'Hour', 'Unique ID', 'Keyword', 'Campaign Name',
    'AdGroup Name', 'Month', 'WeekDay', 'CPCMax', 'Impressions',
    'Average Position', 'Clicks', 'AverageCPC', 'Conversions'];

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
      toPrint[i][4] = allData[uniqueId]['CampaignName'];
      toPrint[i][5] = allData[uniqueId]['AdGroupName'];
      toPrint[i][6] = monthToday;
      toPrint[i][7] = weekDayToday;
      toPrint[i][8] = allData[uniqueId]['ThisHour']['CpcMax'];
      toPrint[i][9] = ImpThisHourOnly;
      toPrint[i][10] = avgPosThisHourOnly;
      toPrint[i][11] = ClicksThisHourOnly;
      toPrint[i][12] = avgCpcThisHourOnly;
      toPrint[i][13] = allData[uniqueId]['ThisHour']['Conversions'] - allData[uniqueId]['LastHour']['Conversions'];

      i++;

    }

    Logger.log("Matrix has been created");

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // SEND INFORMATION TO GOOGLE SHEET

  writeDataToSpreadsheet(spreadsheetUrl, sheetName, toPrint, colHeaders)

  Logger.log("Spreadsheet has been updated");
  Logger.log("Script has been completed");





}

// END OF MAIN FUNCTION
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//




//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
// AUXILIARY FUNCTIONS
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
  // columnHeaders: Headers for the columns (d1 array)
  // RETURN: Nothing

  //This is where i am going to store all my data
  var spreadsheet = SpreadsheetApp.openByUrl(gSheetUrl);
  var sheet = spreadsheet.getSheetByName(sheetName);
  Logger.log("Sheet name: " + sheetName);

  if(!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    // If the sheet does not exist, appends the row with the column titles
    sheet.appendRow(columnHeaders);
    Logger.log("We did not find the Sheet named " + sheetname);
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
  Logger.log("The range is: " + range);
  range.setValues(data);
  Logger.log(data);
}





}
