function remoteScript() {


/************************************
* Manage CPCMax in ADESLAS Regulated KWs
* Version 1.0
* 13/02/2019
* Written By: Pablo Marco
*
* Goal: Manage CPCmax of the regulated KWs, based on a model of
* optimization based on historical data from each KW
* ChangeLog:
*  	No changes
*
**************************************/


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
//Options

var spreadsheetUrl = "https://docs.google.com/spreadsheets/d/1kg2ZJ88LBkyP57rrqH8ASlDuuOZtYovT4yuiiVWCc9A/edit#gid=2057559703";
// URL of the Spreadsheet where we take info from

var labelName = 'Regulada';
// Name of the labels from which we will extract information

var minValueCpcMax = 0.5;
// Value of CPCmax that we will use as minimun for our CPCmax scenarii

var maxValueCpcMax = 4;
// Value of CPCmax that we will use as max for our CPCmax scenarii

var stepCpcMax = 0.1;
// Value of each step that we will use in our CPCmax scenarii

var hourStart = 9;
// First hour when we will run the algorithm

var hourEnd = 21;
// Last hour when we will run the algorithm




//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
// Function MAIN

this.main = function() {


  // Define the symbols we will use for joining
  var fieldJoin = ",";
  var lineJoin = "$";
  var idJoin = "#";

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // CHECK THAT THE FILES WE WILL USE ARE WORKING PROPERLY (12)

  // Check the spreadsheet URL works
  var spreadsheet = checkSpreadsheet(spreadsheetUrl, "the spreadsheet");


  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // CALCULATE TODAY'S DATA IN DIFFERENT FORMATS WE WILL NEED LATER
  var now = new Date();
  var dateToday = Utilities.formatDate(now, AdWordsApp.currentAccount().getTimeZone(), "yyyy-MM-dd");
  var monthToday = Utilities.formatDate(now, AdWordsApp.currentAccount().getTimeZone(), "MM");
  var weekDayToday = Utilities.formatDate(now, AdWordsApp.currentAccount().getTimeZone(), "u");
  var hourToday = Utilities.formatDate(now, AdWordsApp.currentAccount().getTimeZone(), "H");

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // EXTRACT INFORMATION FROM THE LABELS (12)

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
    Logger.log("Labels witht the name: " + labelName + " have NOT been found. The script will stop");
    return;
  }
  Logger.log("Labels witht the name: " + labelName + " have been found.");


  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // DEFINE STRUCTURE OF THE OBJECT

  var allData = {
    // UniqueId: {AvgCpcLimit: , Cost: , Clicks:  ,
    //            HourRegressValues: { a0: , a1: , a2: , erra: , b0: , b1: , b2: , errb: },
    //            Scenario: {FTotalCost: , FTotalClicks: , FtotalAvgCPC: ,
    //                      Hour: {Cost: , Clicks: , AvgCPC: }}}
  }

  // UniqueId is defined as the union of GroupID#KWId
  // HourRegressValues is defined by all the pending hours of the current day number
  //  For example 10
  // Scenario is defined as the CPC list of pending hours and CPCmax
  //  For example 19-0.5#20-0.6#21-0.5
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // CREATE THE GADS REPORT WE WILL USE TO EXTRACT THE DATA (12)

  // Define the columns of the report query in GAds
  var cols = ['AdGroupId', 'Id', 'Cost', 'Clicks'];

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
  // POPULATE THE OBJECT WITH THE DATA FROM THE REPORT

  var rows = report.rows();

  // Start the iteration on all the rows
  while(rows.hasNext()){
    var row = rows.next();

    // Define uniqueId, unique identifier for the KWs
    var uniqueId = row['AdGroupId'] + idJoin + row['Id'];

    // Create the object uniqueId
    allData[uniqueId] = {};

    // Populate the object with data from the report
    allData[uniqueId]['Cost'] = parseFloat(row['Cost'].replace(/,/g,""),10);
    allData[uniqueId]['Clicks'] = parseFloat(row['Clicks'].replace(/,/g,""),10);
  }

  Logger.log("The object has been populated with data from the GAds Report");


  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // KEEP POPULATING THE OBJECT WITH THE DATA FROM THE GOOGLE SHEET

  // https://developers.google.com/apps-script/reference/spreadsheet/
  //https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet

  // Iterate through all the UniqueId objects
  // Check if all the sheets exists, and if it does not, just pass to the next one

  for (var uniqueId in allData){ // ITERATION 1: KEYWORDS
    // Define the name of the sheet an get the range A1:AW30 of the sheet.
    var rangeName = uniqueId + "!A1:AW30";

    // Check if the range exists
    try {
      var range = spreadsheet.getRange(rangeName);
    }
    catch (e) {
      Logger.log("Page " + uniqueId + " does not exist.");
      Logger.log("We will not fill the data for this object");
      continue; // Jump to the next item in the loop
    }
    // If the range exists, import it to the script
    var range = spreadsheet.getRange(rangeName);
    Logger.log("Page " + uniqueId + " DOES exist.");
    Logger.log("Data will be imported to the script");


  // Populate each one of the objects UniqueID with data from the sheets
  // range.getValues returns a matrix. We need to signal the data we need
  allData[uniqueId]['AvgCpcLimit'] = range.getValues()[3][1];

  // Create the object HourRegressValues, where we will keep the regression values
  // for the remaining hours of the day for today's day number. For example,
  // if today in Tuesday, we only take Tuesday's data

  // Iterate for all the hours from now until hourEnd
  for (var i = hourToday; i < hourEnd + 2; i++) { // ITERATION 2: HOURS FOR REGRESSION VALUES

    // Create the object where we will keep the regression values for this
    // hour and this day of the week
    var objectName = weekDayToday + idJoin + i;
    allData[uniqueId][objectName] = {};

    // Populate the object

    // First, identify the position we need to start looking for in our range

    var rangeRow = i - 1; // row number is the hour we want to collect - 1
    var rangeColumnStart = ((weekDayToday - 1) * 8) + 1;

    // Then, complete the population
    allData[uniqueId][objectName]['a0'] = range.getValues()[rangeRow][rangeColumnStart];
    allData[uniqueId][objectName]['a1'] = range.getValues()[rangeRow][rangeColumnStart + 1];
    allData[uniqueId][objectName]['a2'] = range.getValues()[rangeRow][rangeColumnStart] + 2;
    allData[uniqueId][objectName]['b0'] = range.getValues()[rangeRow][rangeColumnStart + 3];
    allData[uniqueId][objectName]['b1'] = range.getValues()[rangeRow][rangeColumnStart + 4];
    allData[uniqueId][objectName]['b2'] = range.getValues()[rangeRow][rangeColumnStart] + 5;
    allData[uniqueId][objectName]['erra'] = range.getValues()[rangeRow][rangeColumnStart + 6];
    allData[uniqueId][objectName]['errb'] = range.getValues()[rangeRow][rangeColumnStart] + 7;

    } // END ITERATION 2

  } // END ITERATION 1

  Logger.log("Completed reading data from gSheets");

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
    // CREATE THE SCENARII AND CALCULATE FORECAST FOR EACH ONE OF THEM

  // Calculate the number of scenarii we will calculate for each hour

  // Iterate for each KW
  for (var uniqueId in allData){ // ITERATION 1: KEYWORDS

    // Iterate for each one of the potential scenarii
    // Scenario is defined as the CPC list of pending hours and CPCmax
    //  For example 19-0.5#20-0.6#21-0.5
    // Iterate for all the hours from now until hourEnd
    for (var i = hourToday; i < hourEnd + 2; i++) { // ITERATION 2: HOURS FOR SCENARII TITLE

      // Iterate for each one of the CpcMax that we want to test in the scenarii
      for (CpcMaxI = minValueCpcMax; CpcMaxI < maxValueCpcMax; CpcMaxI = CpcMaxI + stepCpcMax) {

        // Create the Objects where we will store the information for each scenario
        CpcMaxINice = Math.round(CpcMaxI*10) / 10 // Take out the rounding errors to make it nice

        IdScenario =

        allData[uniqueId][]



      } // END ITERATION 3

  } // END ITERATION 2

} // END ITERATION 1



  // UniqueId: {AvgCpcLimit: , Cost: , Clicks:  ,
  //            HourRegressValues: { a0: , a1: , a2: , erra: , b0: , b1: , b2: , errb: },
  //            Scenario: {FTotalCost: , FTotalClicks: , FtotalAvgCPC: ,
  //                      Hour: {Cost: , Clicks: , AvgCPC: }}}




  Logger.log(allData);

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // CREATE THE OBJECTS THAT STORE, EACH ONE OF THEM, THE RESULTS FOR EACH SCENARIO

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // IDENTIFY WHICH IS THE BEST SCENARIO

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  //


  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // SEND RESULTS OF BEST SCENARIO TO GSHEET
  // SEND DATA OF EACH SCENARIO TO PLOT & SELECION OF BEST SCENARIO TO STORE
  // TRANSFORM THE OBJECT INTO A MATRIX TO MAKE PRINTING TO GSHEET EASY (12 IF NEEDED)

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // SEND RESULTS OF BEST SCENARIO TO GSHEET
  // SEND INFORMATION TO GOOGLE SHEET (12 IF NEEDED)


  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // CHANGE THE CPCMAX OF EACH KEYWORD
  // ADD SECURITY MEASURES (STOP IF SOMETHING STRANGE AND SEND EMAIL)








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

  if(!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    // If the sheet does not exist, appends the row with the column titles
    sheet.appendRow(columnHeaders);
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



} // De function remotescript
