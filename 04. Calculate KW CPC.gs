/************************************
* Calculate Keywords CPC
* Version 1.0
* 14/11/2018
* Written By: Pablo Marco
*
* Goal: This script extracts values of CPCmax and AvgCPC
  of selected KW, in order to calculate AvgCPC = f(CPCmax)
*
* Version: 1.0
* ChangeLog:
*  	No changes
*
**************************************/


//////////////////////////////////////////////////////////////////////////////
// Options


var spreadsheetUrl = "https://docs.google.com/spreadsheets/d/1cs_PS3P8EaKk8ZDOuWJhhKNFIYhp_-43rI1flaxyEwA/edit#gid=0";
// The URL of the Google Doc the results will be put into.


var labelName = "Test";
// This is the name in the label of ther KW that the script will look for

var fieldJoin = ",";
var lineJoin = "$";
// Signs use to join fields and lines in the .txt file

// HERE STARTS THE CODE
  //////////////////////////////////////////////////////////////////////////////

function main() {
  // ------------------------------------------------------------------------
  // HOW DOES THIS FUNCTION WORK?
  // The function writes hourly KW information from GAds in a text file
  // This information can be used later by another script to analyze


  // We use an object to store all the information that we want to gather
  // from gAds. The structure is the following:
  //  - Level 1. An object with the following properties:
  //    - Date: The date of the data extraction (TBD)
  //    - Hour: The hour of the data extraction (TBD)
  //    - (KwUniqueID): As many properties as KW we are going to analyze.
  //      The keys are the KW unique IDs (AdGID + KWId) (String)
  //  - Level 2. The value of each property (KWUniqueID) is an object, with the
  //    following properties:
  //   - KwUniqueId (Repeated but it is OK like that!) (String)
  //   - KwText : Text of the KW, with all the right elements (+, [], etc) (String)
  //   - CampaignName : Name of the campaign it belongs to (String)
  //   - AdGName : Name of the AdG it belongs to (Text)
  //   - CPCBid : CPC Max at this moment (Float)
  //   - AverageCPC ;  Average CPC during the period
  //   - Clicks, Impressions, AveragePosition
  // ------------------------------------------------------------------------

  // -----------------------------------------------------
  // CHECK THAT ALL THE INFORMATION FROM 'OPTIONS' IS GOOD

  // Check that the file exists or create a new one if it does not exist
  checkSpreadsheet(spreadsheetUrl);

  // Check that the label exists, and import Label IDs
  //  to use them in the report query later
  labelIds = collectKWIDsFromLabels(labelName);

  // -----------------------------------------------------
  // CREATE THE DATA STRUCTURE (As explained above)

  var allData = {};

  // -----------------------------------------------------
  // LAUNCH THE REPORT QUERY IN ORDER TO COLLECT ALL THE INFORMATION WE WANT

  var reportQuery = 'SELECT Id, Criteria, KeywordMatchType, AdGroupId, AdGroupName, CampaignName, Impressions, Clicks, AverageCpc, AveragePosition, CpcBid, Labels ' +
    'FROM KEYWORDS_PERFORMANCE_REPORT ' +
    'WHERE Status = ENABLED AND AdGroupStatus = ENABLED AND CampaignStatus = ENABLED ' +
    'AND LabelIds = ' + labelIds[0] + ' ' +
    'DURING TODAY';

  var report = AdWordsApp.report(reportQuery);

  // -----------------------------------------------------
  // COPY THE DATA FROM THE REPORT INTO THE OBJECT

  var rows = report.rows();

  while(rows.hasNext()){
    var row = rows.next();

    // Create an object for each KW
    KwUniqueID = row["AdGroupId"] + '-' + row["Id"] // KwUnique ID is Adgroup ID + KE Id
    allData[KwUniqueID] = {};

    // Add Date and time to each2nd level object
  	var currentDate = Utilities.formatDate(new Date(), AdWordsApp.currentAccount().getTimeZone(), "yyyyMMdd");
  	var currentHour = Utilities.formatDate(new Date(), AdWordsApp.currentAccount().getTimeZone(), "HH");
  	allData[KwUniqueID]["Date"] = currentDate;
  	allData[KwUniqueID]["Hour"] = currentHour;

    // Start populating the new 2nd level objects with the data from the report
    allData[KwUniqueID]["KwUniqueID"] = KwUniqueID;
    allData[KwUniqueID]["KwText"] = (row.KeywordMatchType === 'Exact') ? '['+row.Criteria+']' :
                         (row.KeywordMatchType === 'Phrase') ? '"'+row.Criteria+'"' : row.Criteria;
    allData[KwUniqueID]["CampaignName"] = row.CampaignName;
    allData[KwUniqueID]["AdGroupName"] = row.AdGroupName;
    allData[KwUniqueID]["Impressions"] = parseInt(row.Impressions,10);
    allData[KwUniqueID]["Clicks"] = parseInt(row.Clicks,10);
    allData[KwUniqueID]["AverageCpc"] = parseFloat(row.AverageCpc);
    allData[KwUniqueID]["AveragePosition"] = parseFloat(row.AveragePosition);
    allData[KwUniqueID]["CpcBid"] = parseFloat(row.CpcBid);
  }

  Logger.log(allData);

  // -----------------------------------------------------
  // CREATE A MATRIX WITH THE DATA THAT WE WANT TO RECORD IN THE FILE

    var results = []; // We will keep the data in an array

    for(var KwUniqueID in allData){
      var resultsRow = [
        allData[KwUniqueID]["Date"],
        allData[KwUniqueID]["Hour"],
        allData[KwUniqueID]["KwUniqueID"],
        allData[KwUniqueID]["CpcBid"],
        allData[KwUniqueID]["Impressions"],
        allData[KwUniqueID]["Clicks"],
        allData[KwUniqueID]["AverageCpc"],
        allData[KwUniqueID]["AveragePosition"]
      ];
      results.push(resultsRow);
    }

    Logger.log(results);


  // -----------------------------------------------------
  // RECORD THE DATA INTO THE FILE
  // For each KW, send all the needed information to the function that writes
  //  the file

  var columns = [
    "Date",
    "Hour",
    "KwUniqueID",
    "CpcBid",
    "Impressions",
    "Clicks",
    "AverageCpc",
    "AveragePosition"
  ];

  for (i = 0; i < results.length; i++) {
    var tab = results[i][2];
    var toWrite = [results[i]]; // For the function to work, it has to be a matrix, not an array
    writeDataToSpreadsheet(tab,toWrite, columns);
  }


}


// ----- End of MAIN function -----


// ----------- EXTERNAL FUNCTIONS ----------------


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
// Check the spreadsheet URL has been entered, and that it works

function checkSpreadsheet(spreadsheetUrl) {
  if (spreadsheetUrl.replace(/[AEIOU]/g,"X") == "https://docs.google.com/YXXR-SPRXXDSHXXT-XRL-HXRX") {
    throw("Problem with " + spreadsheetName + " URL: make sure you've replaced the default with a valid spreadsheet URL.");
  }
  try {
    var spreadsheet = SpreadsheetApp.openByUrl(spreadsheetUrl);

    // Checks if you can edit the spreadsheet
    var sheet = spreadsheet.getSheets()[0];
    var sheetName = sheet.getName();
    sheet.setName(sheetName);

    return spreadsheet;
  } catch (e) {
    throw("Problem with " + spreadsheetName + " URL: '" + e + "'");
  }
}



//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

function collectKWIDsFromLabels(labelName) {
  // This function checks whether there are KW with the label "labelName"
  // If there are, it returns the Label ID, to be used later

  var labelIds = [];
  var labelCondition = "LabelName CONTAINS_IGNORE_CASE '" + labelName + "'";
  Logger.log(labelCondition);

  var labelIterator = AdWordsApp.labels()
  .withCondition("KeywordsCount > 0")
  .withCondition(labelCondition)
  .get();

  while (labelIterator.hasNext()) {
    var label = labelIterator.next();
    labelIds.push(label.getId());
  }

  if (labelIds.length == 0) {
    Logger.log("No " + labelName + " labels found.");
    return;
  }
  Logger.log(labelIds.length + " " + labelName + " labels have been found.");
  return labelIds;
}


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
// Write data to the gSheet

function writeDataToSpreadsheet(tab,toWrite, columns) {

  //This is where i am going to store all my data
  var spreadsheet = SpreadsheetApp.openByUrl(spreadsheetUrl);
  var sheet = spreadsheet.getSheetByName(tab);

  if(!sheet) {
    sheet = spreadsheet.insertSheet(tab);
    // If the sheet does not exist, appends the row with the column titles
    sheet.appendRow(columns);
  }

  // Here, the scripts compares the number of rows in the sheet (getMaxRows)
  //  to the number of rows with data (getLastRow)
  //  and adds as many new rows as needed
  var lastRow = sheet.getLastRow();
  var numRows = sheet.getMaxRows();
  if((numRows-lastRow) < toWrite.length) {
    sheet.insertRowsAfter((lastRow == 0) ? 1 : lastRow,toWrite.length-numRows+lastRow);
  }

  // Here the script writes the new values in the spreadsheet
  // First it selects a range that starts 1 row after what has been written before
  // Then it adds the information in "toWrite" in that range
  var range = sheet.getRange(lastRow+1,1,toWrite.length,toWrite[0].length);
  Logger.log(toWrite);
  range.setValues(toWrite);
}
