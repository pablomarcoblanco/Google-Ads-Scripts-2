/************************************
* Store Account, Campaign, and AdGroup Level Quality Score
* Version 1.0
* 3/11/2018
* Written By: Pablo Marco
* Based on Script from Russ Savaga - Freeadwordsscripts.com
*
* Goal: This script calculates QS at account, campaign
*  	and Adgroup Level
* ChangeLog:
*  	No changes
*
**************************************/


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
//Options


var emailAddresses = ["pablomarcoblanco@gmail.com", "paula.serrano@accombpo.com"];
  // List of email addresses of the recipients of the message alerting of a new incoming report
  // Enter like ["a@b.com"] or ["a@b.com","c@d.com","e@g.co.uk"]
  // Leave as [] to skip.

var DECIMALS = 1; //this will give you 1 decimal places of accuracy

//You can set this to anything in this list: TODAY, YESTERDAY, LAST_7_DAYS,
// THIS_WEEK_SUN_TODAY, THIS_WEEK_MON_TODAY, LAST_WEEK, LAST_14_DAYS,
// LAST_30_DAYS, LAST_BUSINESS_WEEK, LAST_WEEK_SUN_SAT, THIS_MONTH
var DATE_RANGE = 'LAST_WEEK';
// Or you can set this to any number of days you like. it overrides the DATE_RANGE set above


var LAST_N_DAYS = 0;

var CSV_FILE_PREFIX = ""; //Set this if you want to write to a set of CSV files, one for each account level.
var SPREADSHEET_URL = "https://docs.google.com/spreadsheets/d/1HabOHO4SxEi6694hRfuoxCxR2cRz3Ps8UBMrk8nuz9I/edit#gid=28659422"; //Set this if you have the url of a spreadsheet you want to update
var SPREADSHEET_NAME = ""; //Set this if you want to write to the name of a spreadsheet instead



//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
// Function MAIN

function main() {

  // Variable to decide if we need to export as CSV or not, depending on selection before
  var isCSV = (CSV_FILE_PREFIX !== "");

  // Gets the processed report with all the results at KW, AdG and Campaign level. Returns the object "results"
  // More info in the function description. This is the core of this script!!
  var allData = getKeywordsReport();

  // Created the array with the names of the sheets that will be created
  var tabs = ['Account','Campaign','AdGroup','Keyword'];

  // Iterates for each one of the values of tabs
  for(var i in tabs) {

    // Creates variable tab for each one of the values of tabs array
    var tab = tabs[i];

    var dataToWrite = [];

    // Calls the function getCols.Function to define the columns in each one of the sheets (as an array)
    var cols = getCols(tab);

    // Calls the function getRowKeys
    // object.keys returns the keys' names of an object, as an array
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/keys
    // allData is the variable that stores the full report already treated
    // Example of one of the keys: AdGroup:1494544044-63190667168
    // Conclusion: function to filter the keys of alldata according to whether they are KW, AdG, campaigns or accounts
    var rowKeys = getRowKeys(tab,Object.keys(allData));

    // For each one of the "tabs", iterates all the properties that have been already filtered
    for(var x in rowKeys) {
      var rowArray = [];

      // key are the keys of each property. For example "AdGroup:1478197348-56070936126"
      var key = rowKeys[x];

      // row is the value of each property according to the key
      var row = allData[key];

      // Iterates for each one of the array "cols", columns according to each sheet
      for(var y in cols) {
        // The push() method adds new items to the end of an array, and returns the new length.
        // So, in each column, we are adding the new value row[cols[y]]
        // For example, for the key: "AdGroup:1478197348-56070936126"
        //  and the col[1] is "account". It will return the value of this property and append it
        //  to the array "rowArray", that has already all the values from previous runnings of the script
        rowArray.push(row[cols[y]]);
      }

      // dataToWrite are arrays whose elements are arrays. Basically 2-d matrices
      dataToWrite.push(rowArray);

    }

    // Write results in CSV or in GSheet, according to user's choice
    if(isCSV) {
      writeDataToCSV(tab,dataToWrite);
    } else {
      writeDataToSpreadsheet(tab,dataToWrite);
    }

  }
	// Send email(s)
    sendEmail();
}
// ----- End of MAIN function -----


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
// Function to filter the keys of alldata according to whether they are KW, AdG, campaigns or accounts

function getRowKeys(tab,allKeys) {

  //The filter() method creates an array filled with all array elements that pass a test (provided as a function).
  // Here, the test is that indexOf(tab) >= 0
  // "tab" is the array of columns depending on the sheet (we can see it in the function getCols below
  // "allKeys" are ther keys of all the elements in our report allvalues
  // Example of a key is AdGroup:1494544044-63190667168
  // Example of "tab" is AdGroup
  // The indexOf() method searches the array for the specified item, and returns its position.
  // https://www.w3schools.com/jsref/jsref_indexof_array.asp
  // Conclusion: this function filters the keys of alldata accourding on whether they are KW, AdG, Campaigns or Accounts
  return allKeys.filter(function(e) { return (e.indexOf(tab) >= 0); });
}


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
// Function to define the columns in each one of the sheets

function getCols(tab) {

  // Creates an object with each property being and array whose values will
  // be the columns of the sheets that we will create.
  // Depending on the value of (tab) it will return the given array
  return {
    'Account' : ['Date','Account', 'totalCost', 'totalImps', 'totalClicks', 'ImpsWeightedQS'],
    'Campaign': ['Date','Account','Campaign','totalCost', 'totalImps', 'totalClicks','ImpsWeightedQS'],
    'AdGroup' : ['Date','Account','Campaign','AdGroup', 'totalCost', 'totalImps', 'totalClicks', 'ImpsWeightedQS'],
    'Keyword' : ['Date','Account','Campaign','AdGroup','Keyword','totalCost', 'totalImps', 'totalClicks', 'CPC', 'QS','ImpsWeightedQS']
  }[tab];
}


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
// Function with Super fast spreadsheet insertion

function writeDataToSpreadsheet(tab,toWrite) {

  //This is where i am going to store all my data
  var spreadsheet;
  if(SPREADSHEET_NAME) {
    var fileIter = DriveApp.getFilesByName(SPREADSHEET_NAME);
    if(fileIter.hasNext()) {
      var file = fileIter.next();
      spreadsheet = SpreadsheetApp.openById(file.getId());
    } else {
      spreadsheet = SpreadsheetApp.create(SPREADSHEET_NAME);
    }
  } else if(SPREADSHEET_URL) {
    spreadsheet = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
  } else {
    throw 'You need to set at least one of the SPREADSHEET_URL or SPREADSHEET_NAME variables.';
  }
  var sheet = spreadsheet.getSheetByName(tab);
  if(!sheet) {
    sheet = spreadsheet.insertSheet(tab);
    // If the sheet does not exist, appends the row with the column titles
    sheet.appendRow(getCols(tab));
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
  range.setValues(toWrite);
}


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
// Function to create csv file

function writeDataToCSV(tab,toWrite) {
  if(!toWrite) { return; }
  var fileName = CSV_FILE_PREFIX + '_' + tab + '.csv';
  var file;
  var fileIter = DriveApp.getFilesByName(fileName);
  if(fileIter.hasNext()) {
    file = fileIter.next();
  } else {
    file = DriveApp.createFile(fileName, formatCsvRow(getCols(tab)));
  }
  var fileData = file.getBlob().getDataAsString();
  for(var i in toWrite) {
    fileData +=  formatCsvRow(toWrite[i]);
  }
  file.setContent(fileData);
  return file.getUrl();
}

function formatCsvRow(row) {
  for(var i in row) {
    if(row[i].toString().indexOf('"') == 0) {
      row[i] = '""'+row[i]+'""';
    }
    if(row[i].toString().indexOf('+') == 0) {
      row[i] = "'"+row[i];
    }
    if(row[i].toString().indexOf(',') >= 0 &&
       row[i].toString().indexOf('"""') != 0)
    {
      row[i] = ('"'+row[i]+'"');
    }
  }
  return row.join(',')+'\n';
}


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
// Function to create the KeyWords Report

function getKeywordsReport() {

  // Calculate the date range for the report
  var theDate = DATE_RANGE;
  if(LAST_N_DAYS != 0) {
    theDate = getDateDaysAgo(LAST_N_DAYS)+','+getDateDaysAgo(1);
  }
  Logger.log('Using date range: '+theDate);


  // Option of GAds Reports to include zero impressions.
  // More here https://developers.google.com/adwords/api/docs/guides/reporting
  var OPTIONS = { includeZeroImpressions : true };

  // Define the columns, type of report and elements of the query in GAds
  var cols = ['ExternalCustomerId',
              'CampaignId','CampaignName',
              'AdGroupId','AdGroupName',
              'Id','Criteria','KeywordMatchType',
              'IsNegative','Impressions', 'Clicks', 'Cost', 'AverageCpc', 'QualityScore'];
  var report = 'KEYWORDS_PERFORMANCE_REPORT';
  var query = ['select',cols.join(','),'from',report,
               'where AdNetworkType1 = SEARCH',
               'and CampaignStatus = ENABLED',
               'and AdGroupStatus = ENABLED',
               'and Status = ENABLED',
               'during',theDate].join(' ');

  // Creates the object "Results" that will store of the results of the treatment of the Adwords report
  var results = {};

  // Iterates for each row of the report for all the rows
  var reportIter = AdWordsApp.report(query, OPTIONS).rows();
  while(reportIter.hasNext()) {
    var row = reportIter.next();

    // The continue statement breaks one iteration (in the loop), if a specified condition occurs, and continues
    // with the next iteration in the loop.
    // https://www.w3schools.com/js/js_break.asp
    if(row.QualityScore == "--") { continue; }
    if(row.IsNegative == true || row.IsNegative === 'true') { continue; }

    // Calls function loadHashEntry. See the details fo the function below
    //Creates 4 types of keys: account, campaign, AdGroup and Keyword
    loadHashEntry('Account:'+ row.ExternalCustomerId,row,results);
    loadHashEntry('Campaign:'+ row.CampaignId,row,results);
    loadHashEntry('AdGroup:'+ [row.CampaignId,row.AdGroupId].join('-'),row,results);
    loadHashEntry('Keyword:'+ [row.CampaignId,row.AdGroupId,row.Id].join('-'),row,results);
  }
  var dateStr = Utilities.formatDate(new Date(), AdWordsApp.currentAccount().getTimeZone(), 'yyyy-MM-dd');

  // var i in "results" is each ones of the entries in the "results" object, which is a map (can be KW, AdG, Campaigns or Accounts)
  // Here we iterate for all the entries
  for(var i in results) {
    // Here we add the "date" property to each one of the values in the keys
    results[i]['Date'] = dateStr;

    // Here we modify the values of "ImpsWeightedQS" property.
    // If totalImps = 0 -> 0. Otherwise, we divide the current value for the total Imps
    results[i]['ImpsWeightedQS'] = (results[i]['totalImps'] === 0) ? 0 : round(results[i]['ImpsWeightedQS']/results[i]['totalImps']);
  }
  return results;
}


;
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
// Function to create the KeyWords Report

function loadHashEntry(key,row,results) {

  // These IF returns an empty row if we are taking the wrong loadHashentry function
  if(!results[key]) {
    results[key] = {
      QS : 0,
      ImpsWeightedQS : 0,
      totalImps : 0,
      totalClicks : 0,
      totalCost : 0,
      CPC : 0,
      Account : null,
      Campaign : null,
      AdGroup : null,
      Keyword : null
    };
  }

  // Here we populate the object "results"
  // The structure we create is a map whose keys are either Accounts, Campaigns, Adg or KW followed by the code
  // The values are, themselves, objects, whose properties we create here: QS, ImpWeightedQs,...
  // On ImpsWeightedQS and totalImps, it adds all the values of the KW related to each Adg / Campaign / Account
  results[key].QS = parseFloat(row.QualityScore);
  results[key].ImpsWeightedQS += (parseFloat(row.QualityScore)*parseFloat(row.Impressions));
  results[key].totalImps += parseFloat(row.Impressions);
  results[key].Account = row.ExternalCustomerId;
  results[key].Campaign = row.CampaignName;
  results[key].AdGroup = row.AdGroupName;
  results[key].Keyword = (row.KeywordMatchType === 'Exact') ? '['+row.Criteria+']' :
                         (row.KeywordMatchType === 'Phrase') ? '"'+row.Criteria+'"' : row.Criteria;
  results[key].totalClicks += parseFloat(row.Clicks);
  results[key].totalCost += parseFloat(row.Cost);
  results[key].CPC = parseFloat(row.AverageCpc);

}

//A helper function to return the number of days ago.
function getDateDaysAgo(days) {
  var thePast = new Date();
  thePast.setDate(thePast.getDate() - days);
  return Utilities.formatDate(thePast, AdWordsApp.currentAccount().getTimeZone(), 'yyyyMMdd');
}

function round(val) {
  var divisor = Math.pow(10,DECIMALS);
  return Math.round(val*divisor)/divisor;
}


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
// Function to send email to warn that  there is a new report

function sendEmail() {
  var localDate = Utilities.formatDate(new Date(), AdWordsApp.currentAccount().getTimeZone(), "yyyy-MM-dd");
  var localTime = Utilities.formatDate(new Date(), AdWordsApp.currentAccount().getTimeZone(), "HH:mm");

  // Assemble the email message
  var subject = "Informe de Quality Score de la cuenta " + AdWordsApp.currentAccount().getName();
  var message = " Buenos días. Puedes encontrar el último informe de QS en el siguiente vínculo.<br />";

  // Añade el vínculo al fichero
  message = message + SPREADSHEET_URL + "\n";


  // Añade la fecha y hora al mensaje
  message = localDate +" at " + localTime +" :" + message;

  MailApp.sendEmail({
    to: emailAddresses.join(", "),
    subject: subject,
    htmlBody: message
  });
  Logger.log(message);
  Logger.log("Message to " + emailAddresses.join(", ") + " sent.");

}
