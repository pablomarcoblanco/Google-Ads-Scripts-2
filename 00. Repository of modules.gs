/************************************
* REPOSITORY OF MODULES
* Version 1.0
* 01/02/2019
* Written By: Pablo Marco
* ChangeLog:
*  	No changes
*
**************************************/

// DATE FUNCTIONS

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

// READ / WRITE IN EXTERNAL FILES


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

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//




//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

// READ / WRITE LABELS

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
  Logger.log("Labels witht the name: " + labelName + " have NOT been found. The script will stop");
  return;
}
Logger.log("Labels witht the name: " + labelName + " have been found.");

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
