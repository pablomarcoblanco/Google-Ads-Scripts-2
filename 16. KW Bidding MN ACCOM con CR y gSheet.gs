/************************************
* Average Position Bidding Tool
* Version 1.0
* 05/06/2019

*
* Goal: This script changes de KW bid based on the
*	objective of maximizing the Net Income
* Defining Net Income as Revenues - GAds Costs

* Version: 1.1
* ChangeLog:
*
* Explanation of algorithm here: https://docs.google.com/document/d/13ZO1uuElSajc6roN2hfxh5ph8FUjJKO-zT3bCKPIh70/edit?ts=5cf97563
**************************************/

// Options

var maxBid = 5.00;
// Bids will not be increased past this maximum.

var minBid = 0.15;
// Bids will not be decreased below this minimum.

var dataFile = "16.Bidding_MN_ACCOM_DKV.txt";
// This name is used to create a file in your Google Drive to store today's performance so far,
// for reference the next time the script is run.

var spreadsheetUrl = "https://docs.google.com/spreadsheets/d/1nf2Dh3r3_zvpxLeybfLYTWHUWlQjfUmaVCMJ_VLm6Go/edit#gid=0";
//Set this if you have the url of a spreadsheet you want to update

var sheetName = "DatosDKV";
// Name of the sheet in the gSheet where we will keep the data

var minConv = 20;
// Minimum number of conversions registered at KW or AdG level so we can
// run the algorithm for this KW

var kwIncomePerLead = 13.3;
// This is the estimated income per Lead we are getting fo rthe KW [dkv]
// This is used temporarily until we introduce the automatic reading of the
// data from the HSheet file where this date is recorded


// The label we will use to indicate that the KW is being managed by the
// algorithm is "AutoMN"

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

function main() {

  var fieldJoin = ",";
  var lineJoin = "$";
  var idJoin = "#";


  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // Calculate the current time
  var currentTime = new Date();

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // Check if we are in a time period when the campaigns are

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // Check that the datafile exists, and create a new one if it does not.
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

  // Check the spreadsheet URL works
  var spreadsheet = checkSpreadsheet(spreadsheetUrl, "the spreadsheet");

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // IDENTIFY THE KWs THAT HAVE THE LABEL AUTOMN

  // Create array to Store the Position Labels
  var labelIds = [];

  // Define Label Iterator
  var labelIterator = AdsApp.labels()
  .withCondition("KeywordsCount > 0")
  .withCondition("LabelName CONTAINS_IGNORE_CASE 'AutoMN'")
  .get();

  // Store all the KW Labels that have the text "automn"
  while (labelIterator.hasNext()) {
    var label = labelIterator.next();
    if (label.getName().toLowerCase() == "automn") {
      labelIds.push(label.getId());
    }
  }

  if (labelIds.length == 0) {
    Logger.log("No labels found.");
    return;
  }
  Logger.log(labelIds.length + " labels have been found.");

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // DEFINE THE STRUCTURE OF THE TWO MAIN DATA STRUCTURES OF THE SCRIPT

  // Define the Structure of the Object keywordData, used during the script
  var kwData = {
    // Time, TimeMin1, uId1: {Kw:, CampaignName, AdGroupName,
    //                        perT: {CpcMax: , DayImpressions, DayClicks: , DayCGAds: , Impressions: , Clicks: ,
    //                          CGAds: , EMN: , EMNNorm: , ZeroClickLoops: ,
    //                          KwCR30: , AdGCR30: },
    //                        perTMin1: {CpcMax: , DayImpressions, DayClicks: , DayCGAds: , EMN: ,
    //                          EMNNorm: , ZeroClickLoops: }
    //                        perTPlus1: {CpcMax: }}
  }

  kwData['Time'] = transformTimeInSecs(currentTime);
  kwData['TimeMin1'] = -100;

  // Define the Structure of the file that will store the KW information in
  //   gDrive in between scripts
  // This file has the structure of a string, and is created by the function
  //   resultsString().

  // [Time, uId1: [CpcMax, DayClicks, DayCGAds, EMN, EMNNorm,
  //                ZeroClickLoops]]



  var ids = [];
  var uIdList = [];
  var adGIdList = [];

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // Create the gAds report with all the data we need from GAds for this day
  var report = AdsApp.report(
    'SELECT Id, Criteria, AdGroupId, AdGroupName, CampaignName, Impressions, Clicks, Cost, CpcBid, Labels, BiddingStrategyType  ' +
    'FROM KEYWORDS_PERFORMANCE_REPORT ' +
    'WHERE Status = ENABLED AND AdGroupStatus = ENABLED AND CampaignStatus = ENABLED ' +
    'AND LabelIds CONTAINS_ANY [' + labelIds.join(",") + '] ' +
    'AND AdNetworkType2 = SEARCH ' +
    'DURING TODAY'
      );


  // Start the iteration on all the KWs
  var rows = report.rows();

  // Start the process for each one of the KWs
  while(rows.hasNext()){
    var row = rows.next();

    // Check that the bidding strategy is manual CPC. Otherwise, warning!
    if (row["BiddingStrategyType"] != "cpc") {
      if (row["BiddingStrategyType"] == "Enhanced CPC"
          || row["BiddingStrategyType"] == "Target search page location"
          || row["BiddingStrategyType"] == "Target Outranking Share"
          || row["BiddingStrategyType"] == "None"
          || row["BiddingStrategyType"] == "unknown") {
        Logger.log("Warning: keyword " + row["Criteria"] + "' in campaign '" +
                   row["CampaignName"] + "' uses '" + row["BiddingStrategyType"] +
                  "' rather than manual CPC. This may overrule keyword bids and interfere with the script working.");
      } else {
        Logger.log("Warning: keyword " + row["Criteria"] + "' in campaign '" +
                   row["CampaignName"] + "' uses the bidding strategy '" +
                   row["BiddingStrategyType"] + "' rather than manual CPC. This keyword will be skipped.");
        continue;
      }
    }


    // Store the KW Ids in a array. We will use it in a function
    ids.push(parseFloat(row['Id'],10));

    // Create uId, which is a unique ID number for each KW,
    // joining KW Id and AdG Id
    var uId = row['AdGroupId'] + idJoin + row['Id'];


    // Store the uIds in a array. This will be used later to batch the work,
    // and to update the file
    uIdList.push(uId);

    // Store the adGroup Ids in a array. We will use it later to extract the
    // Conversion Rate at AdGroup level
    adGIdList.push(parseFloat(row['AdGroupId'],10));

    // Start populating the object kwData
    // Data that are puposefully empty will have the value -100
    kwData[uId] = {};

    // Create and populate the properties unique to each uId

    kwData[uId]['Kw'] =  (row.KeywordMatchType === 'Exact') ? '['+row.Criteria+']' :
                         (row.KeywordMatchType === 'Phrase') ? '"'+row.Criteria+'"' :
                          row.Criteria;

    kwData[uId]['CampaignName'] = row['CampaignName'];
    kwData[uId]['AdGroupName'] = row['AdGroupName'];


    kwData[uId]['perT'] = {};

    kwData[uId]['perT']['CpcMax'] = parseFloat(row['CpcBid'].replace(/,/g,""),10);
    kwData[uId]['perT']['DayImpressions'] = parseFloat(row['Impressions'].replace(/,/g,""),10);
    kwData[uId]['perT']['DayClicks'] = parseFloat(row['Clicks'].replace(/,/g,""),10);
    kwData[uId]['perT']['DayCGAds'] = parseFloat(row['Cost'].replace(/,/g,""),10);
    kwData[uId]['perT']['Impressions'] = -100;
    kwData[uId]['perT']['Clicks'] = -100;
    kwData[uId]['perT']['CGAds'] = -100;
    kwData[uId]['perT']['EMN'] = -100;
    kwData[uId]['perT']['EMNNorm'] = -100;
    // ZeroclickLoops indicates how many loops have passed with zero clicks
    kwData[uId]['perT']['ZeroClickLoops'] = -100;

    kwData[uId]['perTMin1'] = {};
    kwData[uId]['perTMin1']['CpcMax'] = -100;
    kwData[uId]['perTMin1']['DayClicks'] = -100;
    kwData[uId]['perTMin1']['DayCGAds'] = -100;
    kwData[uId]['perTMin1']['EMN'] = -100;
    kwData[uId]['perTMin1']['EMNNorm'] = -100;
    // ZeroclickLoops indicates how many loops have passed with zero clicks
    kwData[uId]['perTMin1']['ZeroClickLoops'] = -100;

    kwData[uId]['perTPlus1'] = {};
    kwData[uId]['perTPlus1']['CpcMax'] = -100;

  }

  Logger.log(uIdList.length + " labelled keywords found");
  Logger.log("Lista de ids:" + ids);

  // Remove duplicate values from adGIdList
  adGIdList = removeDuplicate(adGIdList);
  Logger.log("Lista de ids de AdG:" + adGIdList);

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // Create the gAds report to extract the Keyword CR and number of conversions
  var report = AdsApp.report(
    'SELECT Id, AdGroupId, ConversionRate, Conversions ' +
    'FROM KEYWORDS_PERFORMANCE_REPORT ' +
    'WHERE Status = ENABLED AND AdGroupStatus = ENABLED AND CampaignStatus = ENABLED ' +
    'AND LabelIds CONTAINS_ANY [' + labelIds.join(",") + '] ' +
    'AND AdNetworkType2 = SEARCH ' +
    'DURING LAST_30_DAYS'
      );

    // Start the iteration on all the KWs
    var rows = report.rows();

    // Start the process for each one of the KWs
    while(rows.hasNext()){
      var row = rows.next();

      // Create uId, which is a unique ID number for each KW,
      // joining KW Id and AdG Id
      var uId = row['AdGroupId'] + idJoin + row['Id'];

      // Insert the value of KwCR and conversions in kwData
      kwData[uId]['perT']['KwCR30'] = parseFloat(row['ConversionRate'].replace(/,/g,""),10)/100;
      kwData[uId]['perT']['KwConv30'] = parseFloat(row['Conversions'].replace(/,/g,""),10)
    }


    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

    // Create the gAds report to extract the Keyword CR

    var report = AdsApp.report(
      'SELECT AdGroupId, ConversionRate, Conversions ' +
      'FROM ADGROUP_PERFORMANCE_REPORT ' +
      'WHERE AdGroupStatus = ENABLED AND CampaignStatus = ENABLED ' +
      'AND AdNetworkType2 = SEARCH ' +
      'DURING LAST_30_DAYS'
        );

        // Start the iteration on all the AdGroups
        var rows = report.rows();

        // Start the process for each one of the AdGroups
        while(rows.hasNext()){
          var row = rows.next();

          // Iterate through all the KWs uIds
          for (i = 0; i < uIdList.length; i++) {
            // If the Adgroup ID is the same as first part of uID,
            // then copy the CR
            adGId = uIdList[i].split("#")[0];
            if(adGId == parseFloat(row['AdGroupId'],10)) {
              kwData[uIdList[i]]['perT']['AdGCR30'] = parseFloat(row['ConversionRate'].replace(/,/g,""),10)/100;
              kwData[uIdList[i]]['perT']['AdGConv30'] = parseFloat(row['Conversions'].replace(/,/g,""),10);
            }
          }
        }


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

    // OPEN THE DATA FILE AND WRITE ALL THE RELEVANT INFORMATION in kwData

    // Import file data to the variable "data" as a text chain
    var data = file.getBlob().getDataAsString();

    // If the file is empty, send a warning message and continue
    if (data.length == 0) {Logger.log ("Attention! The file is empty");}
    else {
      // Split the chain by KWs
      var data = data.split(lineJoin);

      Logger.log("Data file is:");
      Logger.log(data);

      // The first field is the time. Let us extract it
      kwData['TimeMin1'] = data[0];

      // In each KW, starting in [1] do the following:
      for(var i = 1; i < data.length; i++){
        // Split each KW text chain by field
        data[i] = data[i].split(fieldJoin);
        var uId = data[i][0];

        // If the data file has a uId coincident with one of those from our list
        // Write the data into kwData
        if(kwData.hasOwnProperty(uId)){

          kwData[uId]['perTMin1']['CpcMax'] = parseFloat(data[i][1],10);
          kwData[uId]['perTMin1']['DayImpressions'] = parseFloat(data[i][2],10);
          kwData[uId]['perTMin1']['DayClicks'] = parseFloat(data[i][3],10);
          kwData[uId]['perTMin1']['DayCGAds'] = parseFloat(data[i][4],10);
          kwData[uId]['perTMin1']['EMN'] = parseFloat(data[i][5],10);
          kwData[uId]['perTMin1']['EMNNorm'] = parseFloat(data[i][6],10);
          kwData[uId]['perTMin1']['ZeroClickLoops'] = parseFloat(data[i][7],10);
        } else {
          Logger.log("ATTENTION. The KW with uId: " + uId +
            " did not match any uId from kwData");
        }
      }
    }



  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

    // UPDATE THE KW DATA OBJECT WITH THE RELEVANT INFORMATION, DEPENDING ON
    // WHETHER WE ARE IN THE FIRST, SECOND OR LATER LOOP

    // First, calculate whether we are in the first loop of the day or not
    // We need to know, because if this is the first one of the day, we will
    // calculate the length of the loop starting at the beginning of the day,
    // not starting at the end of the previous loop. We do this because the data
    // that GAds gives us start at the beginning of the day.
    var loopStatus = calculateFirstLoopOfDay (kwData['Time'], kwData['TimeMin1']);
    Logger.log("Loopstatus: " + loopStatus);

    // Now, iterate for all uIds in our kwData file
    for(var uId in kwData) {

      //In kwData, we have two elements that are not uId. These are Time and TimeMin1
      // If we find them, just jump to the next iteration
      Logger.log("uId: " + uId);
      if (uId == 'Time' || uId == 'TimeMin1') {continue;}

      // Now, for each KW, calculate what is the loop number
      // This could be 1 for first loop, 2 for second or 3 for third or later
      var loopNb = calculateLoopNb (kwData[uId]['perTMin1']['CpcMax'],
                                    kwData[uId]['perTMin1']['EMNNorm']);


      Logger.log("LoopNb es: " + loopNb);
      //~~~~~~~~~~~~~~~~~~~~~
      // Now, update the values of Clicks, CGAds, EMN and EMNNorm

      // Now, we update the values of Clicks, CGAds, EMN and EMNNorm
      // The update will depend on:
      // 1. If we are in first, second or standard loop.
      // 2. If we are in the first loop of the day or not

        switch (loopNb) {

        // 1. If we are in the first loop, there is no information to update
        case 1:
          break;

        // 2. If we are in the second loop or later for this KW, we can calculate Clicks,
        // CGAds, EMN and EMNNorm
        case 2:
        case 3:

          // Now, we need to check whether we are in the first loop of the day or not
          // If we are in the first loop, Clicks and CGAds = DayClicks and DayCGAds
          switch (loopStatus) {

            case "First Loop of Day":
              kwData[uId]['perT']['Impressions'] = kwData[uId]['perT']['DayImpressions'];
              kwData[uId]['perT']['Clicks'] = kwData[uId]['perT']['DayClicks'];
              kwData[uId]['perT']['CGAds'] = kwData[uId]['perT']['DayCGAds'];
              break;

            case "Not First Loop of Day":
              kwData[uId]['perT']['Impressions'] = kwData[uId]['perT']['DayImpressions'] -
                                                kwData[uId]['perTMin1']['DayImpressions'];
              kwData[uId]['perT']['Clicks'] = kwData[uId]['perT']['DayClicks'] -
                                            kwData[uId]['perTMin1']['DayClicks'];
              kwData[uId]['perT']['CGAds'] = kwData[uId]['perT']['DayCGAds'] -
                                           kwData[uId]['perTMin1']['DayCGAds'];
              break;

            default:
              Logger.log("Attention. There is an error 2");
          }

          // Calculate "Esperanza de Margen Neto"
          kwData[uId]['perT']['EMN'] = calculateEMN (
                                        kwData[uId]['perT']['Clicks'],
                                        kwData[uId]['perT']['KwCR30'],
                                        kwData[uId]['perT']['AdGCR30'],
                                        kwData[uId]['perT']['CGAds'],
                                        kwData[uId]['perT']['KwConv30'],
                                        kwData[uId]['perT']['AdGConv30'],
                                        kwData[uId]['Kw'],
                                        kwIncomePerLead, minConv
          );

          // Calculate the "normalized EMN". This is the EMN normalized to 1 hour
          // We need to use it because as the script does not start at fixed times
          // we cannot compare the EMN of two periods unless we "normalise" them to
          // a fixed length of time
          kwData[uId]['perT']['EMNNorm'] = kwData[uId]['perT']['EMN'] / (kwData['Time'] -
                                         kwData['TimeMin1']) * 3600;

          break;


        // If all the previous conditions are false, this means there is an error
        default:
          Logger.log("ATTENTION: There is an error 3");
      }


        //~~~~~~~~~~~~~~~~~~~~~

      // Now, we apply the algorithm that modifies the CPCMax according to the data


      kwData[uId]['perTPlus1']['CpcMax'] = calculateCpcMax(
                                          kwData[uId]['perT']['CpcMax'],
                                          kwData[uId]['perTMin1']['CpcMax'],
                                          kwData[uId]['perT']['Impressions'],
                                          kwData[uId]['perT']['Clicks'],
                                          kwData[uId]['perT']['EMNNorm'],
                                          kwData[uId]['perTMin1']['EMNNorm'],
                                          loopNb,
                                          kwData[uId]['Kw']
                                         );

//~~~~~~~~~~~~~~~~~~~~~

    // Calculate the new number of ZeroClickLoops
    kwData[uId]['perT']['ZeroClickLoops'] = calculateZCL(
                                              kwData[uId]['perT']['Clicks'],
                                              kwData[uId]['perTMin1']['ZeroClickLoops'],
                                              loopNb);
    }

    Logger.log("La nueva kwData es:");
    Logger.log(kwData);

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // NOW WRITE THE FILE THAT WILL STORE THE INFORMATION FOR THE NEXT RUNNING OF THE
  // SCRIPT

  // First, create the string that we will send to the file
  var results = [];

  for(var uId in kwData){
    //In kwData, we have two elements that are not uId. These are Time and TimeMin1
    // If we find 'Time', add it at the beginning of the aray
    if (uId == 'Time') {
      results.unshift(kwData[uId]);
    }

    // If we find 'TimeMin1', do nothing
    else if (uId == 'TimeMin1') {}

    else {
    var resultsRow = [uId,
                      kwData[uId]['perTPlus1']['CpcMax'],
                      kwData[uId]['perT']['DayImpressions'],
                      kwData[uId]['perT']['DayClicks'],
                      kwData[uId]['perT']['DayCGAds'],
                      kwData[uId]['perT']['EMN'],
                      kwData[uId]['perT']['EMNNorm'],
                      kwData[uId]['perT']['ZeroClickLoops']
                      ];
    results.push(resultsRow.join(fieldJoin));
    }
  }

  results = results.join(lineJoin);
  Logger.log("Los datos para la nueva file son: ");
  Logger.log(results);

  // Now, send the new content to the data file
  file.setContent(results);

  Logger.log("The data file has been created");



  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // UPDATE THE CPCMAX IN THE KWs

  // Create a new object that contains the uId and the new CPCmax for each one of
  // them. It will be an array of arrays
  var cpcMaxList = [];

  for (i = 0; i < uIdList.length; i++) {
    cpcMaxList[i] = [];
    cpcMaxList[i][0] = uIdList[i];
    cpcMaxList[i][1] = kwData[uIdList[i]]['perTPlus1']['CpcMax'];
  }

  //Batch the keyword IDs, as the iterator can't take them all at once
  var idBatches = [];
  var batchSize = 5000;
  for (var i=0; i<cpcMaxList.length; i += batchSize) {
    idBatches.push(cpcMaxList.slice(i,i+batchSize));
  }

  Logger.log("Updating keywords");

  // Update each batch
  for (var i=0; i<idBatches.length; i++) {
    try {
      updateKeywords(idBatches[i], idJoin, ids, uIdList);
    } catch (e) {
      Logger.log("Error updating keywords: " + e);
      Logger.log("Retrying after one minute.");
      Utilities.sleep(60000);
      updateKeywords(idBatches[i]);
    }
  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // TRANSFORM THE OBJECT INTO A MATRIX TO MAKE PRINTING TO GSHEET EASY
  // WE WILL ADD SOME EXTRA INFORMATION RELATED TO DATES
  // We will create a single row for each KW

  // Calculate the date of today
  var dateToday = Utilities.formatDate(currentTime,
    AdWordsApp.currentAccount().getTimeZone(), "yyyy-MM-dd");
  var weekDayToday = Utilities.formatDate(currentTime,
    AdWordsApp.currentAccount().getTimeZone(), "u");
  var hourToday = Utilities.formatDate(currentTime,
    AdWordsApp.currentAccount().getTimeZone(), "H");

  // Define the column headers
  var colHeaders = ['Date',
                    'WeekDay',
                    'Hour',
                    'Unique ID',
                    'Keyword',
                    'Campaign Name',
                    'AdGroup Name',
                    'CPCMaxMin1',
                    'CPCMax',
                    'CPCMaxPlus1',
                    'Impressions',
                    'Clicks',
                    'CGAds',
                    'KWConv30',
                    'KwCR30',
                    'AdGConv30',
                    'AdGCR30',
                    'EMNMin1',
                    'EMN',
                    'EMNNormMin1',
                    'EMNNorm',
  ];

    // Create the matrix that will store all the data for printing in GSHEET
    var toPrint = [];

    // Create the counter that will mark the row number
    var i = 0;

    // Start Loop for each UniqueID
    for (uId in kwData) {

      //In kwData, we have two elements that are not uId. These are Time and TimeMin1
      // If we find them, just jump to the next iteration
      if (uId == 'Time' || uId == 'TimeMin1') {continue;}

      // Create the row for the matrix
      toPrint[i] = [];

      // Fill the matrix
      toPrint[i][0] = dateToday;
      toPrint[i][1] = weekDayToday;
      toPrint[i][2] = hourToday
      toPrint[i][3] = uId;
      toPrint[i][4] = kwData[uId]['Kw'];
      toPrint[i][5] = kwData[uId]['CampaignName'];
      toPrint[i][6] = kwData[uId]['AdGroupName'];
      toPrint[i][7] = kwData[uId]['perTMin1']['CpcMax'];
      toPrint[i][8] = kwData[uId]['perT']['CpcMax'];
      toPrint[i][9] = kwData[uId]['perTPlus1']['CpcMax'];
      toPrint[i][10] = kwData[uId]['perT']['Impressions'];
      toPrint[i][11] = kwData[uId]['perT']['Clicks'];
      toPrint[i][12] = kwData[uId]['perT']['CGAds'];
      toPrint[i][13] = kwData[uId]['perT']['KwConv30'];
      toPrint[i][14] = kwData[uId]['perT']['KwCR30'];
      toPrint[i][15] = kwData[uId]['perT']['AdGConv30'];
      toPrint[i][16] = kwData[uId]['perT']['AdGCR30'];
      toPrint[i][17] = kwData[uId]['perTMin1']['EMN'];
      toPrint[i][18] = kwData[uId]['perT']['EMN'];
      toPrint[i][19] = kwData[uId]['perTMin1']['EMNNorm'];
      toPrint[i][20] = kwData[uId]['perT']['EMNNorm'];

      i++;

    }

    Logger.log("Matrix has been created");

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // SEND INFORMATION TO GOOGLE SHEET

  writeDataToSpreadsheet(spreadsheetUrl, sheetName, toPrint, colHeaders)

  Logger.log("Spreadsheet has been updated");
  Logger.log("Script has been completed");

}

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//




  // Functions

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

function calculateEMN (clicks, kwCR30, adGCR30, cGAds, kwConv30, adGConv30, kw,
                          kwIncomePerLead, minConv) {
// Calculates the "esperanza de Margen Neto"
// clicks: nb of clicks for the KW in the last period
// kwCR30: CR for the KW in the last 30 days
// adGCR30: CR for the adgroup in the last 30 days
// cGAds: gAds cost for the WK in the last period
// kwConv30: Nb of conversions for the KW in the last 30 days
// adGConv30: Nb of conversions for the AdG in the last 30 days
// kw: KW Name
// kwIncomePerLead: Estimated income per lead for this campaign
// minConv: Minimum number of conversions so we think calculation is right

  // First, check if we have the minimum number of conversions at KW or at
  // AdG level, and decide which CR you will use

  if (kwConv30 >= minConv) {convRate = kwCR30;}
  else if (adGConv30 >= minConv) {convRate = adGCR30;}
  else if (adGConv30 < minCon){
    convRate = adGCR30;
    Logger.log("Attention! The keyword " + kw + " does not have enough conversions" +
      " in the last 30 days to have an accurate forecast of the conversion rate");
  }
  else {
    ("Attention! There is an error 6 in the script");
    return;
  }

  // Now, calculate the EMN
  return clicks * convRate * kwIncomePerLead - cGAds;
}



  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//


function calculateCpcMax(cpcMax, cpcMaxMin1, impressions, clicks,
                         eMNNorm, eMNNormMin1, loopNb, kw) {
// Function to calculate the CPCMax for the next loop.
// CpcMax, CPCMaxMin1: CPCmax of the KW now and at the end of the last period
// Impressions: Nb of impressions in this period
// Clicks Nb of clicks in this period
// EMNNorm, EMNNNormMin1: Expected Net Margin in this and hte last period
// loopNb: Loop number. Can be 1, 2 or 3 (third or later loop)
// kw: Name of the kw
// RETURN: Floating point value with the new CPCMax

  // First we initialize the variable cpcMaxPlus1 with an "empty" value.
  var cpcMaxPlus1 = -100;

  // Now, we will act differently depending on the loop number for this KW
  switch (loopNb) {

    case 1:
      // In this case, we keep the same value for CPCMax next loop
      cpcMaxPlus1 = cpcMax;
      Logger.log("New CPCMax: " + cpcMaxPlus1);
      return cpcMaxPlus1;

    case 2:
      // We add 0.2 to the previous CPCmax
      cpcMaxPlus1 = cpcMax + 0.2;
      Logger.log("New CPCMax: " + cpcMaxPlus1);
      return cpcMaxPlus1;

    case 3:
      // We are in a normal loop
      // We will act differently depending on the number of impressions and
      // clicks

      // If impressions = 0, either we are off or we do have very litle traffic.
      // In this case, we leave CPCmax with the same value
      if (impressions == 0) {cpcMaxPlus1 = cpcMax;}

      // If we had ipressions but did not have clicks, we increase the CPCmax
      // a little bit
      else if (impressions != 0 && clicks == 0) {cpcMaxPlus1 = cpcMax + 0.05;}

      // If we had clicks, we apply the standard formula
      else {
        // We need to calculate whether the slope of the curve with CPCmax in x
        // and EMNNorm in y was positive or negative
        // First, calculate the slope
          slope = (eMNNorm - eMNNormMin1) / (cpcMax - cpcMaxMin1);
          if (slope >= 0 ) {
            cpcMaxPlus1 = cpcMax + 0.1;
            return cpcMaxPlus1;
          }
          else {
            cpcMaxPlus1 = cpcMaxMin1 - 0.1;
            return cpcMaxPlus1;
          }
      }
  }

  // Finally, check that our new CPCmax is not higher than our MaxBid, lower
  // than our MinBid nor higher than the Average CPC where we know we are not
  // making money

  if (cpcMaxPlus1 > maxBid) {
    cpcMaxPlus1 = maxBid;
    Logger.log("La KW " + kw + " ha alcanzado el límite superior de puja de " +
      maxBid);
  }

  if (cpcMaxPlus1 < minBid) {
    cpcMaxPlus1 = minBid;
    Logger.log("La KW " + kw + " ha alcanzado el límite inferior de puja de " +
      minBid);
  }

  return cpcMaxPlus1;

}

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
function calculateLoopNb (cpcMaxMin1, eMNNormMin1) {
// Identifies whether we are in the first, second or nornal loop (thirr or later)
// cpcMaxMin1: CPCMax from the previous loop
// eMNNormMin1: eMNNor for the previous loop
// Return: Variable witht he following values:
//  1 if it is the first loop
//  2 if it is the second loop
//  3 if it is the third loop or later (normal loop)
  // If CPCmax from T-1 is empty, this means we are in the first Loop

  Logger.log("cpcMaxMin1 es: " + cpcMaxMin1);

  if(cpcMaxMin1 == -100) {return 1;}
  // If CPCmax(t-1) is not empty but EMN(t-1) is empty, this means we are
  // in the second loop
  else if (cpcMaxMin1 != -100 && eMNNormMin1 == -100) {return 2;}
  // In the rest of cases, we are in the loop 3 or further. This should be
  // the normal situation when we are regularly using the algorithm.
  else if (cpcMaxMin1 != -100 && eMNNormMin1 != -100) {return 3;}
  // If none of these conditions apply, we have an ERROR
  else {
    Logger.log("ATTENTION. There is an error in the calculation of Loop Number");
    return;
  }
}


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

function calculateFirstLoopOfDay (time, timeMinus1) {
// Calculates if the current loop is the first loop of the day
// time: Time at the beginning of the current loop (in seconds)
// timeMinus1: time of the previous loop (in seconds)

  // If timeMinus1 = -100, this means, we have not created a file yet
  if(timeMinus1 == -100) {return "Empty File";}
  // If current time is smaller than previous one, we are in first loop
  else if(time < timeMinus1) {return "First Loop of Day";}
  else {return "Not First Loop of Day";}
}


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

function calculateZCL(clicks, zeroClickLoopsMin1, loopNb) {
// Calculates the number of consecutive loops with zero clicks, counting the
// current loops and previous ones
// Clicks: Nb of clicks in this loop
// zeroClickLoopsMin1: Nb of consecutive zero click loops in previous loop
// loopNb: Loop number. Can be 1, 2 or 3 (third or later loop)
// return: int number:
//  -100 if this is the first loop, so we have not completed any period
//  any other int number, including 0

  // Now, we will act differently depending on the loop number for this KW
  switch (loopNb) {

    case 1:
    // In this case, we return -100
      return -100;

    case 2:
    // This means we have completed the first period we can measure
      if (clicks == 0) {return 1;}
      else {return 0;}

    case 3:
    // This means we have at least two periods
      // If there are no clicks in this period, we add 1 to whatever was before
      if (clicks == 0) {return zeroClickLoopsMin1 + 1;}
      // If we have clicks, we return 0
      else {return 0;}

    default:
    Logger.log("ATTENTION. There is an error 4");
  }
}

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

function transformTimeInSecs(time) {
// Function to transform a give time object in the number of seconds since
// the beginning of the day.
// time: current time in the gAds time format
// RETURN: Floating point value with the time in seconds since the beginning of the day
  var seconds = parseInt(Utilities.formatDate(time,
                AdWordsApp.currentAccount().getTimeZone(), "ss"), 10);

  var minutesInSecs = parseInt(Utilities.formatDate(time,
                      AdWordsApp.currentAccount().getTimeZone(), "mm"), 10) * 60;

  var hoursInSecs = parseInt(Utilities.formatDate(time,
                      AdWordsApp.currentAccount().getTimeZone(), "HH"), 10) * 3600;

  return seconds + minutesInSecs + hoursInSecs;
}

  //~~~~~~~~~~~~~~~~~~~~~~~//

  function keyworduId(keyword, ids, uIdList, idJoin){
  // Function that recreates the uId based on the Id of KWs
  // keyword: is the object keyword from GAds
  // ids: is the list of KW ids that we created before

    // First, extract the id from the keyword we are assessing
    var id = keyword.getId();

    // Find in which position of the ids array we can find this keyword
    var idsIndex = ids.indexOf(id);

    // If the position is the same if we start counting at the beginning and
    // at the end -> If it is not repeated, then take the uId from uId List
    if(idsIndex === ids.lastIndexOf(id)){
      return uIdList[idsIndex];
    }
    // Otherwise (if the ID is repeated), take it from GAds
    // This is probably done to make the software faster
    else{
      var adGroupId = keyword.getAdGroup().getId();
      return adGroupId + idJoin + id;
    }
  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//


function updateKeywords(batch, idJoin, ids, uIdList) {
// Function that updates the CPCmax of the keywords
// idBatch is an array of arrays. Each element provides information of a KW.
//   First element is the KW uID
//   Second element is the new CPCmax
// idJoin is the standard idJoin

  // First, create an array that only has the uIds and other that only has
  // the CPCmax
  var idBatch = [];
  var cpcMaxs = [];
  for (i = 0; i<batch.length; i++) {
    idBatch.push(batch[i][0]);
    cpcMaxs.push(batch[i][1]);
  }

  // Now, create an iterator for all the Kws with the Ids we are using
  var keywordIterator = AdWordsApp.keywords()
  .withIds(idBatch.map(function(str){return str.split(idJoin);}))
  .get();

  //Now, for each keyword, do the following.
  while(keywordIterator.hasNext()){
    var keyword = keywordIterator.next();

    // Recreate uId. We will use a function
    var uId = keyworduId(keyword, ids, uIdList, idJoin);

    // Using the uId, we locate the position of the CPCmax in the
    // array batch
    var newBid = cpcMaxs[idBatch.indexOf(uId)];

    if(newBid !== -1){
      keyword.setMaxCpc(newBid);
      Logger.log("The new Bid for the KW: " + uId + " is: " + newBid);
    }
  }
}

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

function removeDuplicate(array) {
// Removes duplicate items form an array
// array: The array that (could) have duplicate elements
// Return: Array without duplicate elements

    var seen = {};
    return array.filter(function(item) {
        return seen.hasOwnProperty(item) ? false : (seen[item] = true);
    });
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
  Logger.log("The range is: " + range);
  range.setValues(data);
  Logger.log(data);
}
