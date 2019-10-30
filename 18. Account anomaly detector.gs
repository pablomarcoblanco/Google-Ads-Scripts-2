/************************************
* Account Anomaly Detector
* Version 1.0
* 15/07/2019
* Written By: Pablo Marco
* Based on Script from Google Developers
*
* Goal: One-shot script to extract KW data from old ADESLAS account
* to be used in future algorithms
* ChangeLog:
*  	No changes
*

/**
 * @name Account Anomaly Detector
 *
 * @fileoverview The Account Anomaly Detector alerts the advertiser whenever an
 * advertiser account is suddenly behaving too differently from what's
 * historically observed. See
 * https://developers.google.com/google-ads/scripts/docs/solutions/account-anomaly-detector
 * for more details.
 *

 */

var SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1FCaBYRGLhkJyFuDPNHTy7rTAIhxQfOm7P0kqBomnmK0/edit#gid=0';

var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday',
            'Saturday', 'Sunday'];

/**
 * Configuration to be used for running reports.
 */
var REPORTING_OPTIONS = {
  // Comment out the following line to default to the latest reporting version.
  apiVersion: 'v201809'
};

function main() {
  Logger.log('Using spreadsheet - %s.', SPREADSHEET_URL);
  var spreadsheet = validateAndGetSpreadsheet(SPREADSHEET_URL);
  spreadsheet.setSpreadsheetTimeZone(AdsApp.currentAccount().getTimeZone());

  var impressionsThreshold = parseField(spreadsheet.
      getRangeByName('impressions').getValue());
  var clicksThreshold = parseField(spreadsheet.getRangeByName('clicks').
      getValue());
  var conversionsThreshold =
      parseField(spreadsheet.getRangeByName('conversions').getValue());
  var costThreshold = parseField(spreadsheet.getRangeByName('cost').getValue());
  var weeksStr = spreadsheet.getRangeByName('weeks').getValue();
  var weeks = parseInt(weeksStr.substring(0, weeksStr.indexOf(' ')));
  var email = spreadsheet.getRangeByName('email').getValue();

  Logger.log(impressionsThreshold);

  var now = new Date();

  // Basic reporting statistics are usually available with no more than a 3-hour
  // delay.
  var upTo = new Date(now.getTime() - 3 * 3600 * 1000);
  var upToHour = parseInt(getDateStringInTimeZone('HH', upTo));

  Logger.log(upToHour);

  if (upToHour == 1) {
    // first run for the day, kill existing alerts
    spreadsheet.getRangeByName('clicks_alert').clearContent();
    spreadsheet.getRangeByName('impressions_alert').clearContent();
    spreadsheet.getRangeByName('conversions_alert').clearContent();
    spreadsheet.getRangeByName('cost_alert').clearContent();
  }

  var dateRangeToCheck = getDateStringInPast(0, upTo);
  var dateRangeToEnd = getDateStringInPast(1, upTo);
  var dateRangeToStart = getDateStringInPast(1 + weeks * 7, upTo);
  var fields = 'HourOfDay,DayOfWeek,Clicks,Impressions,Conversions,Cost';
  var todayQuery = 'SELECT ' + fields +
      ' FROM ACCOUNT_PERFORMANCE_REPORT DURING ' + dateRangeToCheck + ',' +
      dateRangeToCheck;
  var pastQuery = 'SELECT ' + fields +
      ' FROM ACCOUNT_PERFORMANCE_REPORT WHERE DayOfWeek=' +
      DAYS[getDateStringInTimeZone('u', now)].toUpperCase() +
      ' DURING ' + dateRangeToStart + ',' + dateRangeToEnd;

      Logger.log(todayQuery);
      Logger.log(pastQuery);

  var todayStats = getReportStats(todayQuery, upToHour, 1);
  var pastStats = getReportStats(pastQuery, upToHour, weeks);

  Logger.log(todayStats);
  Logger.log(pastStats);

  var statsExist = true;
  if (typeof todayStats === 'undefined' || typeof pastStats === 'undefined') {
    statsExist = false;
  }

  var alertText = [];
  if (statsExist && impressionsThreshold &&
      todayStats.impressions < pastStats.impressions * impressionsThreshold) {
    var ImpressionsAlert = '    Impressions are too low: ' +
        todayStats.impressions + ' impressions by ' + upToHour +
        ':00, expecting at least ' +
        parseInt(pastStats.impressions * impressionsThreshold);
    writeAlert(spreadsheet, 'impressions_alert', alertText, ImpressionsAlert,
        upToHour);
  }
  if (statsExist && clicksThreshold &&
      todayStats.clicks < pastStats.clicks * clicksThreshold) {
    var clickAlert = '    Clicks are too low: ' + todayStats.clicks +
        ' clicks by ' + upToHour + ':00, expecting at least ' +
        (pastStats.clicks * clicksThreshold).toFixed(1);
    writeAlert(spreadsheet, 'clicks_alert', alertText, clickAlert, upToHour);
  }
  if (statsExist && conversionsThreshold &&
      todayStats.conversions < pastStats.conversions * conversionsThreshold) {
    var conversionsAlert =
        '    Conversions are too low: ' + todayStats.conversions +
        ' conversions by ' + upToHour + ':00, expecting at least ' +
        (pastStats.conversions * conversionsThreshold).toFixed(1);
    writeAlert(
        spreadsheet, 'conversions_alert', alertText, conversionsAlert,
        upToHour);
  }
  if (statsExist && costThreshold &&
      todayStats.cost > pastStats.cost * costThreshold) {
    var costAlert = '    Cost is too high: ' + todayStats.cost + ' ' +
          AdsApp.currentAccount().getCurrencyCode() + ' by ' + upToHour +
          ':00, expecting at most ' +
          (pastStats.cost * costThreshold).toFixed(2);
    writeAlert(spreadsheet, 'cost_alert', alertText, costAlert, upToHour);
  }

  if (alertText.length > 0 && email && email.length > 0) {
    MailApp.sendEmail(email,
        'Google Ads Account ' + AdsApp.currentAccount().getCustomerId() +
        ' misbehaved.',
        'Your account ' + AdsApp.currentAccount().getCustomerId() +
        ' is not performing as expected today: \n\n' + alertText.join('\n') +
        '\n\nLog into Google Ads and take a look.\n\nAlerts dashboard: ' +
        SPREADSHEET_URL);
  }

  writeDataToSpreadsheet(spreadsheet, now, statsExist, todayStats, pastStats,
      AdsApp.currentAccount().getCustomerId());
}

function toFloat(value) {
  value = value.toString().replace(/,/g, '');
  return parseFloat(value);
}

function parseField(value) {
  if (value == 'No alert') {
    return null;
  } else {
    return toFloat(value);
  }
}

/**
 * Runs a Google Ads report query for a number of weeks and return the average
 * values for the stats.
 *
 * @param {string} query The formatted report query.
 * @param {int} hours The limit hour of day for considering the report rows.
 * @param {int} weeks The number of weeks for the past stats.
 * @return {Object} An object containing the average values for the stats.
 */
function getReportStats(query, hours, weeks) {
  var reportRows = [];
  var report = AdsApp.report(query);
  var rows = report.rows();
  while (rows.hasNext()) {
    reportRows.push(rows.next());
  }
  Logger.log(reportRows);
  return accumulateRows(reportRows, hours, weeks);
}

function accumulateRows(rows, hours, weeks) {
  var result = {clicks: 0, impressions: 0, conversions: 0, cost: 0};

  Logger.log(rows.length);
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var hour = row['HourOfDay'];
    Logger.log("Hour: " + hour + " y Hours: " + hours);

    if (hour < hours) {
      result = addRow(row, result, 1 / weeks);
    }
  }
  return result;
}

function addRow(row, previous, coefficient) {
  if (!coefficient) {
    coefficient = 1;
  }
  if (row == null) {
    row = {Clicks: 0, Impressions: 0, Conversions: 0, Cost: 0};
  }
  if (!previous) {
    return {
      clicks: parseInt(row['Clicks']) * coefficient,
      impressions: parseInt(row['Impressions']) * coefficient,
      conversions: parseInt(row['Conversions']) * coefficient,
      cost: toFloat(row['Cost']) * coefficient
    };
  } else {
    return {
      clicks: parseInt(row['Clicks']) * coefficient + previous.clicks,
      impressions:
          parseInt(row['Impressions']) * coefficient + previous.impressions,
      conversions:
          parseInt(row['Conversions']) * coefficient + previous.conversions,
      cost: toFloat(row['Cost']) * coefficient + previous.cost
    };
  }
}

/**
 * Produces a formatted string representing a date in the past of a given date.
 *
 * @param {number} numDays The number of days in the past.
 * @param {date} date A date object. Defaults to the current date.
 * @return {string} A formatted string in the past of the given date.
 */
function getDateStringInPast(numDays, date) {
  date = date || new Date();
  var MILLIS_PER_DAY = 1000 * 60 * 60 * 24;
  var past = new Date(date.getTime() - numDays * MILLIS_PER_DAY);
  return getDateStringInTimeZone('yyyyMMdd', past);
}


/**
 * Produces a formatted string representing a given date in a given time zone.
 *
 * @param {string} format A format specifier for the string to be produced.
 * @param {date} date A date object. Defaults to the current date.
 * @param {string} timeZone A time zone. Defaults to the account's time zone.
 * @return {string} A formatted string of the given date in the given time zone.
 */
function getDateStringInTimeZone(format, date, timeZone) {
  date = date || new Date();
  timeZone = timeZone || AdsApp.currentAccount().getTimeZone();
  return Utilities.formatDate(date, timeZone, format);
}

/**
 * Validates the provided spreadsheet URL and email address
 * to make sure that they're set up properly. Throws a descriptive error message
 * if validation fails.
 *
 * @param {string} spreadsheeturl The URL of the spreadsheet to open.
 * @return {Spreadsheet} The spreadsheet object itself, fetched from the URL.
 * @throws {Error} If the spreadsheet URL or email hasn't been set
 */
function validateAndGetSpreadsheet(spreadsheeturl) {
  if (spreadsheeturl == 'YOUR_SPREADSHEET_URL') {
    throw new Error('Please specify a valid Spreadsheet URL. You can find' +
        ' a link to a template in the associated guide for this script.');
  }
  var spreadsheet = SpreadsheetApp.openByUrl(spreadsheeturl);
  var email = spreadsheet.getRangeByName('email').getValue();
  if ('foo@example.com' == email) {
    throw new Error('Please either set a custom email address in the' +
        ' spreadsheet, or set the email field in the spreadsheet to blank' +
        ' to send no email.');
  }
  return spreadsheet;
}

/**
 * Writes the alert time in the spreadsheet and push the alert message to the
 * list of messages.
 *
 * @param {Spreadsheet} spreadsheet The dashboard spreadsheet.
 * @param {string} rangeName The named range in the spreadsheet.
 * @param {Array<string>} alertText The list of alert messages.
 * @param {string} alertMessage The alert message.
 * @param {int} hour The limit hour used to get the stats.
 */
function writeAlert(spreadsheet, rangeName, alertText, alertMessage, hour) {
  var range = spreadsheet.getRangeByName(rangeName);
  if (!range.getValue() || range.getValue().length == 0) {
    alertText.push(alertMessage);
    range.setValue('Alerting ' + hour + ':00');
  }
}

/**
 * Writes the data to the spreadsheet.
 *
 * @param {Spreadsheet} spreadsheet The dashboard spreadsheet.
 * @param {Date} now The date corresponding to the running time of the script.
 * @param {boolean} statsExist A boolean that indicates the existence of stats.
 * @param {Object} todayStats The stats for today.
 * @param {Object} pastStats The past stats for the period defined in the
 * spreadsheet.
 * @param {string} accountId The account ID.
 */
function writeDataToSpreadsheet(spreadsheet, now, statsExist, todayStats,
                                pastStats, accountId) {
  spreadsheet.getRangeByName('date').setValue(now);
  spreadsheet.getRangeByName('account_id').setValue(accountId);
  spreadsheet.getRangeByName('timestamp').setValue(
    getDateStringInTimeZone('E HH:mm:ss z', now));

  if (statsExist) {
    var dataRows = [
      [todayStats.impressions, pastStats.impressions.toFixed(0)],
      [todayStats.clicks, pastStats.clicks.toFixed(1)],
      [todayStats.conversions, pastStats.conversions.toFixed(1)],
      [todayStats.cost, pastStats.cost.toFixed(2)]
    ];
    spreadsheet.getRangeByName('data').setValues(dataRows);
  }
}
