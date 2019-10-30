/************************************
* Alerts follow up in the accounts hola
* Version 1.0
* 6/11/2018
* Written By: Pablo Marco
*
* Goal: This script checks a series of alerts in the accounts
*	based on limits defined in a gSheet.
*
* Version: 1.0
* ChangeLog:
*  	No changes
*
**************************************/


//////////////////////////////////////////////////////////////////////////////
// Options


var emailAddresses = ["pablomarcoblanco@gmail.com", "paula.serrano@accombpo.com"];
  // List of email addresses of the recipients of the message alerting of a new incoming report
  // Enter like ["a@b.com"] or ["a@b.com","c@d.com","e@g.co.uk"]
  // Leave as [] to skip.

var spreadsheetUrl = "https://docs.google.com/spreadsheets/d/1i73tcCSV6X8rl_z5USmw-UOjOrL0HM9h9IVnmn8noaU/edit#gid=1010811892";
// The URL of the Google Doc the results will be put into.



// HERE STARTS THE CODE
  //////////////////////////////////////////////////////////////////////////////

function main()
{

	//Check the spreadsheet has been entered, and that it works
	Logger.log('Checking Spreadsheet - %s.', spreadsheetUrl)
	var spreadsheet = checkSpreadsheet(spreadsheetUrl, "Alert_Collection");

  	// Select the range in GSheets that contains all the data
 	var range = spreadsheet.getRangeByName('Data');


    // -----------------------------------------------------

    // DEFINE THE ARAYS WHERE WE WILL KEEP ALL THE INFORMATION

	// Report Name
  	var name = [];

  	// Row number in the gSheet where we will find this alert
  	var rangeRow = [];

  	// type of GAds report that we will use
  	var gAdsReportType = [];

  	// Metric we will use for this alarm
  	var alertMetric = [];

  	// Coumns we will have in the report
  	var reportCols = [];

  	// Data rangoe for the query
  	var queryDateRange = [];

  	// Query for the report
  	var query = [];

  	// Google Ads Report that has been transformed into an array
  	var treatedReport = [];

  	// Alerts. Keeps the info on how many alerts are there for each category
  	var nbOfAlerts = [];

  // -----------------------------------------------------

  // INSERT THE DATA FOR EACH REPORT

	//------------------------
  	// Alarm 0 : Ad Position

    // Define the report name
  	name[0] = 'Ad Position';

  	// Define the row number in the gSheet where we will find this alert
    rangeRow[0] = 0;

    // Define the type of GAds report we will use
    // We will use Ad Performance Report
    // https://developers.google.com/adwords/api/docs/appendix/reports/ad-performance-report
    gAdsReportType[0] ="AD_PERFORMANCE_REPORT";

    // Define the metric that we will use for this alarm
    // Name according to the name in GAds Report, as we will add it to the query
    alertMetric[0] = "AveragePosition";

    // Define the columns we will have in the report
    // ATTENTION, last column should be the same as the alertMetric!!!
    reportCols[0] = ["Date", "Id", "CampaignName", "AdGroupName", "HeadlinePart1",
                      "Impressions", "Clicks", "Conversions", "AveragePosition"];

  	// Define the date range for the query
  	queryDateRange[0] = "YESTERDAY";

 	//------------------------
  	// Alarm 1 : Click Through Rate (CTR)

    // Define the report name
  	name[1] = 'KW CTR';

  	// Define the row number in the gSheet where we will find this alert
    rangeRow[1] = 1;

    // Define the type of GAds report we will use
    gAdsReportType[1] ="KEYWORDS_PERFORMANCE_REPORT";

    // Define the metric that we will use for this alarm
    // Name according to the name in GAds Report, as we will add it to the query
    alertMetric[1] = "Ctr";

    // Define the columns we will have in the report
    // ATTENTION, last column should be the same as the alertMetric!!!
    reportCols[1] = ["Date", "Id", "CampaignName", "AdGroupName", "Criteria",
                      "Impressions", "Clicks", "Conversions", "Ctr"];

  	// Define the date range for the query
  	queryDateRange[1] = "YESTERDAY";


  //------------------------
  	// Alarm 2 : Total cost per account

    // Define the report name
  	name[2] = 'Account Cost';

  	// Define the row number in the gSheet where we will find this alert
    rangeRow[2] = 2;

    // Define the type of GAds report we will use
    gAdsReportType[2] ="ACCOUNT_PERFORMANCE_REPORT";

    // Define the metric that we will use for this alarm
    // Name according to the name in GAds Report, as we will add it to the query
    alertMetric[2] = "Cost";

    // Define the columns we will have in the report
    // ATTENTION, last column should be the same as the alertMetric!!!
    reportCols[2] = ["Date", "AccountDescriptiveName", "Impressions", "Clicks", "Conversions", "Cost"];

  	// Define the date range for the query
  	queryDateRange[2] = "YESTERDAY";


  //------------------------
  	// Alarm 3 : All conversions per account

    // Define the report name
  	name[3] = 'Account Conversions';

  	// Define the row number in the gSheet where we will find this alert
    rangeRow[3] = 3;

    // Define the type of GAds report we will use
    gAdsReportType[3] ="ACCOUNT_PERFORMANCE_REPORT";

    // Define the metric that we will use for this alarm
    // Name according to the name in GAds Report, as we will add it to the query
    alertMetric[3] = "AllConversions";

    // Define the columns we will have in the report
    // ATTENTION, last column should be the same as the alertMetric!!!
    reportCols[3] = ["Date", "AccountDescriptiveName", "Impressions", "Clicks", "Cost", "AllConversions"];

  	// Define the date range for the query
  	queryDateRange[3] = "YESTERDAY";


  //------------------------
  	// Alarm 4 : Average CPA per account

    // Define the report name
  	name[4] = 'Account CPA';

  	// Define the row number in the gSheet where we will find this alert
    rangeRow[4] = 4;

    // Define the type of GAds report we will use
    gAdsReportType[4] ="ACCOUNT_PERFORMANCE_REPORT";

    // Define the metric that we will use for this alarm
    // Name according to the name in GAds Report, as we will add it to the query
    alertMetric[4] = "CostPerAllConversion";

    // Define the columns we will have in the report
    // ATTENTION, last column should be the same as the alertMetric!!!
    reportCols[4] = ["Date", "AccountDescriptiveName", "Impressions", "Clicks", "AllConversions", "Cost", "CostPerAllConversion"];

  	// Define the date range for the query
  	queryDateRange[4] = "YESTERDAY";


   // -----------------------------------------------------

  // CREATE REPORTS AND PRINT THEM IN THE GOOGLE SHEET

  	// Create all the queries
	for (var i in name) {
		query[i] = createQuery (range, name[i], rangeRow[i], gAdsReportType[i], alertMetric[i], reportCols[i], queryDateRange[i]);
      	Logger.log(query[i]);
    }

  	// Create all the reports and the array with number of alerts
  	for (var i in name) {
		treatedReport[i] = buildReport(query[i], reportCols[i])['report'];
      	Logger.log(treatedReport[i]);
      	nbOfAlerts[i] = buildReport(query[i], reportCols[i])['alerts'];
      	Logger.log(nbOfAlerts[i]);
    }

 	// Write all the reports in the spreadsheet
  	for (var i in name) {
		writeDataToSpreadsheet(name[i], treatedReport[i], reportCols[i]);
    }

  	// If there are alerts, send an email to the recipients identified in the gShees
  	sendSummaryEmail(name, nbOfAlerts);

}

// ----- End of MAIN function -----



// ----------- EXTERNAL FUNCTIONS ----------------

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
// Check the spreadsheet URL has been entered, and that it works
function checkSpreadsheet(spreadsheetUrl, spreadsheetName) {
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


function createQuery (range, name, rangeRow, gAdsReportType, alertMetric, reportCols, queryDateRange) {

  min = range.getValues()[rangeRow][6];
  max = range.getValues()[rangeRow][7];
  impThreshold = range.getValues()[rangeRow][8];
  clickThreshold = range.getValues()[rangeRow][9];
  convThreshold = range.getValues()[rangeRow][10];

  // Array with the list of metrics with type "Money". The unit here is "microns", so
  //  we need to multiply our values times 1,000,000
  var moneyType = ['AverageCPC', 'Cost', 'CostPerAllConversion', 'CostPerConversion',
                   'AverageCost'];


  alertMetricCond = function() {
    // if alertMetric is in moneyType array, then multiply x1,000,000
    if (moneyType.indexOf(alertMetric) != (-1)) {
    	min = min * 1000000;
      	max = max * 1000000;
      	Logger.log('Attention, AlertMetric is MONEY type');
    }


    if (min == 0) {return alertMetric + " < " + max;}
    else {return alertMetric + " > " + min + " AND " +
      alertMetric + " < " + max;}
  };

  impressionsCond = function() {
    if (impThreshold == 0) {return "";}
    else {return " AND " + "Impressions" + " > " + impThreshold;}
  };

  clicksCond = function() {
    if (clickThreshold == 0) {return "";}
    else {return " AND " + "Clicks" + " > " + clickThreshold;}
  };

  convsCond = function() {
    if (convThreshold == 0) {return "";}
    else {return " AND " + "Conversions" + " > " + convThreshold;}
  };

  statusCond = function () {
    if (gAdsReportType == "ACCOUNT_PERFORMANCE_REPORT") {return "";}
    else {
      	return " AND " + "CampaignStatus" + " = " + "ENABLED" + " AND " +
    "AdGroupStatus" + " = " + "ENABLED" + " AND " +
    "Status" + " = " + "ENABLED";
    }
  }

  var reportConds =
    alertMetricCond() +
    impressionsCond() +
    clicksCond() +
    convsCond() +
    statusCond();

  var reportQuery =
    "SELECT " + 	reportCols.join(", ") + " " +
    "FROM " + 	gAdsReportType + " " +
    "WHERE " + 	reportConds + " " +
    "DURING " +  queryDateRange;

return reportQuery;

}



//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
// Function to extract the GAds report and then transform it into a data matrix that we can print

function buildReport (query, columns) {

	// First, we extract the report from Google Ads
  	// Each row of the adwords is an object itself.

  	// Defines the matrix of the report
  	var report = [];

  	// Defines how many alerts are there in each category
  	var alerts = 0;

  	// Iterate through all rows in the GAds Report
  	var reportIter = AdWordsApp.report(query).rows();
  	while(reportIter.hasNext()) {
    	var row = reportIter.next();

      	// Count the number of alerts
      	alerts++;

      	// Defines the array that stores the information of each row of the matrix
  		var reportRow = [];

      	// For each element of the array "columns", copy the property of "row" whose key
      	//  is equal to the element.
      	for (var x in columns) {
        	value = row[columns[x]];
          	reportRow.push(value);
        }
      	report.push(reportRow);
    }

  	// If the report is empty (because there is no alert), create a matrix with the message "No hay alertas en esta fecha"
  	if (report.length == 0) {

      	// Change variable alert to signal there is no alert
      	alerts = 0;

      	// Print the date of yesterday
      	var MILLIS_PER_DAY = 1000 * 60 * 60 * 24;
		var now = new Date();
		var yesterday = new Date(now.getTime() - MILLIS_PER_DAY);
      	report[0] = Utilities.formatDate(yesterday, AdWordsApp.currentAccount().getTimeZone(), "yyyy-MM-dd");

      	// Print the message "No alerts in this date"
      	report[1] = 'No hay alertas en esta fecha';

      	// Fill the rest of the collumns with blank spaces
      	i = 2;
      	while (i < columns.length) {
          	report[i] = "";
          	i++;
        }
      	report = [report]; // Transforma el vector en una matriz de dimensión 2 para poder pegarlo en gSheets
    }

  	// Create the object that puts together "report" and "alerts"
  		reportBuild = {
        	report: report,
          	alerts: alerts
        }

  return reportBuild;
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
  range.setValues(toWrite);
}


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
// Send summary Email if there is an alert

function sendSummaryEmail(name, nbOfAlerts) {

  // Check if there is any alert. If there is no alert, just print a message and end the function
  function isZero(currentValue) {return currentValue == 0;}
  if (nbOfAlerts.every(isZero)) {return;}

  //Otherwise, prepare the email
  var localDate = Utilities.formatDate(new Date(), AdWordsApp.currentAccount().getTimeZone(), "dd-MM-yyyy");
  var localTime = Utilities.formatDate(new Date(), AdWordsApp.currentAccount().getTimeZone(), "HH:mm");

  // Assemble the email message
  var subject = "Alerta(s) en la cuenta " + AdWordsApp.currentAccount().getName() + " del " + localDate;
  var message = "Buenos días. ";


  // Add day and time to the message
  message += "El día " + localDate +" a las " + localTime;

  // Add the account number
  message += " se han identificado en la cuenta -" + AdWordsApp.currentAccount().getName() +
    		"- la(s) siguiente(s) alerta(s) del día anterior: <br/><br/> ";

  // Add the name and number of alarms
  for (var i in nbOfAlerts) {
    if (i != 0) {
    	message += name[i] + ". Número de alertas: " + nbOfAlerts[i] + "<br/>";
    }
  }

  // Add the link to the google Sheet
  message += "<br/> Puedes encontrar el histórico de las alarmas en el siguiente vínculo: " + spreadsheetUrl;


	Logger.log(message);

  // Send the email
  MailApp.sendEmail({
    to: emailAddresses.join(", "),
    subject: subject,
    htmlBody: message
  });
  Logger.log("Message to " + emailAddresses.join(", ") + " sent.");
}
