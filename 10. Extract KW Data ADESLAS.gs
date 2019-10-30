/************************************
* Extract historic data from ADESLAS
* Version 1.0
* 01/02/2019
* Written By: Pablo Marco
* Based on Script from Russ Savaga - Freeadwordsscripts.com
*
* Goal: One-shot script to extract KW data from old ADESLAS account
* to be used in future algorithms
* ChangeLog:
*  	No changes
*
**************************************/


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
//Options

var dateStartStr = '2018-04-16';
// Date to start gathering data
// Format 'YYYY-MM-DD'

var dateEndStr = '2018-06-20';
// Date to end gathering data
// Format 'YYYY-MM-DD'

var spreadsheetUrl = "https://docs.google.com/spreadsheets/d/14Wof3nODDGs-NmMkvjbRNaNybpvhA5W1Ar2Rb8hr9u8/edit#gid=0";
//Set this if you have the url of a spreadsheet you want to update

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
// Function MAIN

function main() {

  // Define the symbols we will use for joining
  var fieldJoin = ",";
  var lineJoin = "$";
  var idJoin = "#";

  // Check the spreadsheet URL works
  var spreadsheet = checkSpreadsheet(spreadsheetUrl, "the spreadsheet");


  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // EXTRACT THE LABELIDs of the KEYWORDS WE WANT TO EXTRACT INFORMATION FROM

  // Create vector to Store the Position Labels
  var labelIds = [];

  // Define Label Iterator
  // We will extract the Label IDs of the KW that have the KW "Regulada"
  var labelIterator = AdWordsApp.labels()
  .withCondition("KeywordsCount > 0")
  .withCondition("LabelName CONTAINS_IGNORE_CASE 'Regulada'")
  .get();

  // Store all the KW Labels that have the text "position"
  while (labelIterator.hasNext()) {
    var label = labelIterator.next();
    if (label.getName().substr(0,"regulada".length).toLowerCase() == "regulada") {
      labelIds.push(label.getId());
    }
  }

  if (labelIds.length == 0) {
    Logger.log("No 'Regulada' labels found.");
    return;
  }
  Logger.log("'Regulada' labels have been found.");


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // CREATE THE OBJECT THAT WILL STORE ALL THE DATA

  var allData = {
    //uniqueId: {Kw: , dateStr: {MonthNb: , WeekDay: , CpcMax: , Impressions: , Clicks: ,
    //           AverageCpc: , Conversions: }}
  }

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
// LAUNCH THE LOOP THAT WILL ITERATE EVERY DAY IN THE SELECTED TIME PERIOD AND COLLECT THE DATA
// IN THE OBJECT


  // Transform the dates into object date in js format
  // For more info visit https://developers.google.com/google-ads/scripts/docs/features/dates
  var dateStart = createDateObj(dateStartStr);
  var dateEnd = createDateObj(dateEndStr);

  // Var to jump from one day to the next in the objects of GAds.
  // For more info visit https://developers.google.com/google-ads/scripts/docs/features/dates
  var millisPerDay = 1000 * 60 * 60 * 24;
  var nbOfDays = (dateEnd - dateStart) / millisPerDay;
  Logger.log("Número de días: " + nbOfDays);

  // Starts the For Loop that iterates through each single day
  for (var i = 0; i < nbOfDays + 1; i++) {
    // Specify the date of the report
    var date = new Date(dateStart.getTime() + millisPerDay * i);


  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
    // CREATE THE GOOGLE ADS REPORT

    // Define the columns of the report query in GAds
    var cols = ['CampaignName', 'AdGroupId','AdGroupName', 'Id','Criteria',
                'KeywordMatchType','IsNegative','CpcBid', 'Impressions',
                'Clicks', 'AverageCpc', 'Conversions'];

    // Define the GAds report type that we will use
    var reportType = 'KEYWORDS_PERFORMANCE_REPORT';

    // Define the conditions of the query
    var queryConditions = 'LabelIds CONTAINS_ANY [' + labelIds.join(fieldJoin) + ']'

    // Define the date range for the report
    // We trnasform the date object into a string with Reports format yyyyMMdd
    // Find reference in https://developers.google.com/adwords/api/docs/guides/awql
    var dateGadsReport = Utilities.formatDate(date, AdsApp.currentAccount().getTimeZone(), 'yyyyMMdd');

    // Define the query
    var query = 'SELECT ' + cols.join(',') +
                ' FROM ' + reportType +
                ' WHERE ' + queryConditions +
                ' DURING ' + dateGadsReport + ', ' + dateGadsReport;

    // Define the report
    var report = AdWordsApp.report(query);

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
      // POPULATE KEYWORD DATA OBJECT WITH THE INFORMATION FROM THE GADS REPORT

      var rows = report.rows();

      // Start the iteration on all the rows
      while(rows.hasNext()){
        var row = rows.next();

        // The continue statement breaks one iteration (in the loop), if a specified condition occurs, and continues
        // with the next iteration in the loop.
        // https://www.w3schools.com/js/js_break.asp
        if(row.IsNegative == true || row.IsNegative === 'true') { continue; }

        // Define uniqueId, unique identifier for the KWs
        var uniqueId = row['AdGroupId'] + idJoin + row['Id'];

        // Defines dateStr, that we will use as a unique identifier for data belonging to
        // each date for all the Keywords.
        // We will use the format yyyyMMdd
        var dateStr = Utilities.formatDate(date, AdsApp.currentAccount().getTimeZone(), 'yyyyMMdd');

        // If we are in the first day, create all the new objects.
        // Otherwise, just continue
        if (i == 0) {
          // Create the object unique Id
          allData[uniqueId] = {};
          // Create the field 'KW', which is the same for all dates
          allData[uniqueId]['Kw'] =  (row.KeywordMatchType === 'Exact') ? '['+row.Criteria+']' :
                                     (row.KeywordMatchType === 'Phrase') ? '"'+row.Criteria+'"' :
                                     row.Criteria;
        }


        // Fill the data of keywordData for each specific date

        allData[uniqueId][dateStr] = {}; // Creates "date" as a unique identifier for all data
                                      // related to this date for each one of the Kws

        allData[uniqueId][dateStr]['MonthNb'] = Utilities.formatDate(date,AdsApp.currentAccount().getTimeZone(), 'MM');

        allData[uniqueId][dateStr]['WeekDay'] = Utilities.formatDate(date, AdsApp.currentAccount().getTimeZone(), 'u');
        allData[uniqueId][dateStr]['CpcMax'] = parseFloat(row['CpcBid'].replace(/,/g,""),10);
        allData[uniqueId][dateStr]['Impressions'] = parseFloat(row['Impressions'].replace(/,/g,""),10);
        allData[uniqueId][dateStr]['Clicks'] = parseFloat(row['Clicks'].replace(/,/g,""),10);
        allData[uniqueId][dateStr]['AverageCpc'] = parseFloat(row['AverageCpc'].replace(/,/g,""),10);
        allData[uniqueId][dateStr]['Conversions'] = parseFloat(row['Conversions'].replace(/,/g,""),10);
    }
  }

  Logger.log("Object with data from gAds report has been created");

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // TRANSFORM THE OBJECT INTO A MATRIX TO MAKE PRINTING TO GSHEET EASY
  // We will create a single row for each KW, and a single row for each date of each KW

  // Define the column headers
  var colHeaders = ['Unique ID', 'Keyword', 'Date', 'Month', 'WeekDay', 'CPCMax',
    'Impressions', 'Clicks', 'AvrageCPC', 'Conversions'];

  // Create the matrix that will store all the data for printing in GSHEET
  var toPrint = [];

  // Create the counter that will mark the row number
  var i = 0;

  // Start Loop for each UniqueID and dateStr (Attention because the properties of
  // each Unique ID are the dates, but also the KWText)
  for (uniqueId in allData) {
    for (key in allData[uniqueId]) { // I write key because there are dates and KW texts
        // If the key is 'Keyword', jump to the next iteration
        if (allData[uniqueId][key]['WeekDay'] === undefined) { continue; }

        // Otherwise, create the row for the matrix, and iterate
        toPrint[i] = []
        toPrint[i][0] = uniqueId;
        toPrint[i][1] = allData[uniqueId]['Kw'];
        toPrint[i][2] = key;
        toPrint[i][3] = allData[uniqueId][key]['MonthNb'];
        toPrint[i][4] = allData[uniqueId][key]['WeekDay'];
        toPrint[i][5] = allData[uniqueId][key]['CpcMax'];
        toPrint[i][6] = allData[uniqueId][key]['Impressions'];
        toPrint[i][7] = allData[uniqueId][key]['Clicks'];
        toPrint[i][8] = allData[uniqueId][key]['AverageCpc'];
        toPrint[i][9] = allData[uniqueId][key]['Conversions'];

        i++;
    }
  }

  Logger.log("Matrix has beeen created");

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // COPY THE MATRIX INTO A GOOGLE SHEET

  var sheetName = 'DATOS ' + dateStartStr + ' ' + dateEndStr;
  writeDataToSpreadsheet(spreadsheetUrl, sheetName, toPrint, colHeaders)

  Logger.log("Script has been completed");

}

// END OF MAIN FUNCTION
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//




//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
function createDateObj(str1){
  // Transforms a string date with the forma yyyy/MM/dd into a js object
  // Entries: str1: Date string. Format should be yyyy/MM/dd.
  // Exit: js Date object
  // Separator can be anything e.g. / or -. It wont effect
  var day1   = parseInt(str1.substring(8,11));
  var month1  = parseInt(str1.substring(5,7));
  var year1   = parseInt(str1.substring(0,4));
  var date1 = new Date(year1, month1-1, day1);
  return date1;
}

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
function checkSpreadsheet(spreadsheetUrl, spreadsheetName) {
  // Function to check the spreadsheet URL has been entered, and that it works
  // spreadsheetUrl: URL of the spreadsheet we want to check
  // spreadsheetName: Name we will use only if we have an error message
  // RETURN

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
