function remoteScript() {


/************************************
* Net Profit optimization bidding tool
* Version 2.1
* 21/06/2019

*
* Goal: This script changes de KW bid based on the
*	objective of maximizing the Net Income
* Defining Net Income as Revenues - GAds Costs

* Version: 2.1
* ChangeLog:
* ChangeLog:
* v2.1 Solve the problem when we have 2 days with Impressions = 0
* v2.2 Allow Income data from several Campaigns
*
* Explanation of algorithm here: https://www.draw.io/?state=%7B%22ids%22:%5B%221VCaxqOd2n-eh0ot0vS6MKpiNzS_ej1V3%22%5D,%22action%22:%22open%22,%22userId%22:%22109434882329674552440%22%7D
**************************************/

// Options

var dateTemp = "YESTERDAY";
// https://developers.google.com/adwords/api/docs/guides/awql

var maxBid = 5.00;
// Bids will not be increased past this maximum.

var minBid = 0.15;
// Bids will not be decreased below this minimum.

var minClicks = 15;
// Minimum number of clicks so we can use the data of a period

var minConv = 20;
// Minimum number of conversions registered at KW or AdG level so we can
// run the algorithm for this KW

var dataFile = "16.Bidding_MN_ACCOM_DKV.txt";
// This name is used to create a file in your Google Drive to store today's performance so far,
// for reference the next time the script is run.

var spreadsheetUrl = "https://docs.google.com/spreadsheets/d/1cP5NrvHPzvdt5cx-0__Be_g_xKvVe8xI6ujyp5Z-jbM/edit#gid=534594593";
//This is the URL of the datasheet with all the data of the algorithm

var sheetName = "DatosDKV";
// Name of the sheet in the gSheet where we will keep the data

var recipients = ["pablo.marco@faktica.com"];
// If set, these addresses will be emailed with a list of all warnings and alarms generated
//   during the algorithm
// Enter like ["a@b.com"] or ["a@b.com","c@d.com","e@g.co.uk"]
// Leave as [] to skip.


var kwIncomePerLead = {};
  kwIncomePerLead['Search_Salud_Marca_Seguro_Mobile'] = 24.4;
  kwIncomePerLead['Search_Salud_Marca exacta_Mobile'] = 18.7;
  kwIncomePerLead['Search_Salud_Marca_Interes_Mobile'] = 9.0;
// This is the estimated income per Lead we are getting for each of the main campaigns
// This is used temporarily until we introduce the automatic reading of the
// data from the GSheet file where this date is recorded
// Data coming from here https://docs.google.com/spreadsheets/d/1JudvLjcb0NsCGl7dFeUXahd-rt9td33QNnOmIhJqkVA/edit#gid=1184571697


// The label we will use to indicate that the KW is being managed by the
// algorithm is "AutoMN"

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

this.main = function() {

  var fieldJoin = ",";
  var lineJoin = "$";
  var idJoin = "#";


  // Crate the array that will store all the warnings and errors to send by email
  var issuesList = [];

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // Calculate the current time
  var currentTime = new Date();

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // If we are on Sunday or Monday, do not run the algorithm,
  // As the algorithm takes info from the previous days (Saturday and Monday),
  // when the campaigns are off


  var weekDayToday = Utilities.formatDate(currentTime,
    AdWordsApp.currentAccount().getTimeZone(), "u");


  if (weekDayToday == 1 || weekDayToday == 7) {
    Logger.log("Ayer la campaña no estuvo activa, por lo que el algoritmo no funcionará hoy.");
    return;
  }



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

  // DEFINE THE STRUCTURE OF THE MAIN DATA STRUCTURE OF THE SCRIPT

  // Define the Structure of the Object keywordData, used during the script
  var kwData = {
    // uId1: {Kw:, CampaignName, AdGroupName,
    //       perT: {CpcMax: , DayImpressions, DayImpShare : , DayClicks: , DayCGAds: ,
    //              KwCR30: , AdGCR30: },
    //       perTA: {CpcMax: , DayImpressions, DayImpShare : , DayClicks: , DayCGAds: ,
    //               EMNNorm: , nbDays},
    //       perTB: {CpcMax: , DayImpressions, DayImpShare : , DayClicks: , DayCGAds: ,
    //              EMNNorm: , nbDays},
    //       perTPlus1: {CpcMax: }}
  }

  // Define the Structure of the file that will store the KW information in
  //   gDrive in between scripts
  // This file has the structure of a string, and is created by the function
  //   resultsString().



  var ids = [];
  var uIdList = [];
  var adGIdList = [];

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // Create the gAds report with all the data we need from GAds for the day before
  var report = AdsApp.report(
    'SELECT Id, Criteria, AdGroupId, AdGroupName, CampaignName, Impressions, ' +
    'SearchImpressionShare, Clicks, Cost, CpcBid, Labels, BiddingStrategyType, ' +
    'KeywordMatchType ' +
    'FROM KEYWORDS_PERFORMANCE_REPORT ' +
    'WHERE Status = ENABLED AND AdGroupStatus = ENABLED AND CampaignStatus = ENABLED ' +
    'AND LabelIds CONTAINS_ANY [' + labelIds.join(",") + '] ' +
    'AND AdNetworkType2 = SEARCH ' +
    'DURING ' + dateTemp
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


    // Store the KW Ids in a array. We will use it in a function later
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

    kwData[uId]['Kw'] =  (row.KeywordMatchType == 'Exact') ? '['+row.Criteria+']' :
                         (row.KeywordMatchType == 'Phrase') ? '"'+row.Criteria+'"' :
                          row.Criteria;

    kwData[uId]['CampaignName'] = row['CampaignName'];
    kwData[uId]['AdGroupName'] = row['AdGroupName'];

    kwData[uId]['perT'] = {};
    kwData[uId]['perT']['CpcMax'] = parseFloat(row['CpcBid'].replace(/,/g,""),10);
    kwData[uId]['perT']['DayImpressions'] = parseFloat(row['Impressions'].replace(/,/g,""),10);

    // Deal with the issues of SearchImpressionShare
    // If there is no data from the previous period, add a number that shows there is an error
    // so we can solve it later in the algorithm
    if (row['SearchImpressionShare'] == "--") {
      row['SearchImpressionShare'] = "200.00";
      // Add a warning issueW01 to the issues List
      issuesList = addIssue(issuesList, "issueW01");
    }

    kwData[uId]['perT']['DayImpShare'] = parseFloat(row['SearchImpressionShare'].replace(/,/g,""),10)/100;
    Logger.log("KW: " + kwData[uId]['Kw'] + " Imp. Share: " + kwData[uId]['perT']['DayImpShare']);


    kwData[uId]['perT']['DayClicks'] = parseFloat(row['Clicks'].replace(/,/g,""),10);
    kwData[uId]['perT']['DayCGAds'] = parseFloat(row['Cost'].replace(/,/g,""),10);

    kwData[uId]['perTA'] = {};
    kwData[uId]['perTA']['CpcMax'] = -100;
    kwData[uId]['perTA']['DayImpressions'] = -100;
    kwData[uId]['perTA']['DayImpShare'] = -100;
    kwData[uId]['perTA']['DayClicks'] = -100;
    kwData[uId]['perTA']['DayCGAds'] = -100;
    kwData[uId]['perTA']['EMNNorm'] = -100;
    kwData[uId]['perTA']['nbDays'] = -100;

    kwData[uId]['perTB'] = {};
    kwData[uId]['perTB']['CpcMax'] = -100;
    kwData[uId]['perTB']['DayImpressions'] = -100;
    kwData[uId]['perTB']['DayImpShare'] = -100;
    kwData[uId]['perTB']['DayClicks'] = -100;
    kwData[uId]['perTB']['DayCGAds'] = -100;
    kwData[uId]['perTB']['EMNNorm'] = -100;
    kwData[uId]['perTB']['nbDays'] = -100;

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
      kwData[uId]['perT']['KwConv30'] = parseFloat(row['Conversions'].replace(/,/g,""),10);
    }


    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

    // Create the gAds report to extract the AdGroup CR

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

        Logger.log(kwData);

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

    // OPEN THE DATA FILE AND WRITE ALL THE RELEVANT INFORMATION in kwData

    // Import file data to the variable "data" as a text chain
    var data = file.getBlob().getDataAsString();

    // If the file is empty, send a warning message and continue
    if (data.length < 10) {Logger.log ("Attention! The file is empty");}
    else {
      // Split the chain by KWs
      var data = data.split(lineJoin);

      Logger.log("Data file is:");
      Logger.log(data);

      // In each KW, starting in [0] do the following:
      for(var i = 0; i < data.length; i++){
        // Split each KW text chain by field
        data[i] = data[i].split(fieldJoin);
        var uId = data[i][0];

        // If the data file has a uId coincident with one of those from our list
        // Write the data into kwData
        if(kwData.hasOwnProperty(uId)){

          kwData[uId]['perTA']['CpcMax'] = parseFloat(data[i][1],10);
          kwData[uId]['perTA']['DayImpressions'] = parseFloat(data[i][2],10);
          kwData[uId]['perTA']['DayImpShare'] = parseFloat(data[i][3],10);
          kwData[uId]['perTA']['DayClicks'] = parseFloat(data[i][4],10);
          kwData[uId]['perTA']['DayCGAds'] = parseFloat(data[i][5],10);
          kwData[uId]['perTA']['EMNNorm'] = parseFloat(data[i][6],10);
          kwData[uId]['perTA']['nbDays'] = parseFloat(data[i][7],10);

          kwData[uId]['perTB']['CpcMax'] = parseFloat(data[i][8],10);
          kwData[uId]['perTB']['DayImpressions'] = parseFloat(data[i][9],10);
          kwData[uId]['perTB']['DayImpShare'] = parseFloat(data[i][10],10);
          kwData[uId]['perTB']['DayClicks'] = parseFloat(data[i][11],10);
          kwData[uId]['perTB']['DayCGAds'] = parseFloat(data[i][12],10);
          kwData[uId]['perTB']['EMNNorm'] = parseFloat(data[i][13],10);
          kwData[uId]['perTB']['nbDays'] = parseFloat(data[i][14],10);

        } else {
          Logger.log("ATTENTION. The KW with uId: " + uId +
            " did not match any uId from kwData");
        }
      }
    }



    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // REVIEW AMD, IF NEEDED, MODIFY THE DATA OF DAYIMPSHARE

  // Check for each KW we have
  for(var uId in kwData) {
    // If 'DayImpshare' == 2, this means Google did not provide the data
    // from the previous period
    if (kwData[uId]['perT']['DayImpShare'] == 2) {
      // Send a warning message to the log
      Logger.log("GAds did not provide the data of Impression share for KW " +
        kwData[uId]['Kw']);

      // If there is data it TB, take the IS for the last period as replacement
      if (kwData[uId]['perTB']['DayImpShare'] != -100) {
        Logger.log("Taking data from TB. Data used will be: " +
          kwData[uId]['perTB']['DayImpShare']);
        kwData[uId]['perT']['DayImpShare'] = kwData[uId]['perTB']['DayImpShare'];
      }

      // Otherwise, check in TA, take the IS for the last period as replacement
      else if (kwData[uId]['perTA']['DayImpShare'] != -100) {
        Logger.log("Taking data from TA. Data used will be: " +
          kwData[uId]['perTA']['DayImpShare']);
        kwData[uId]['perT']['DayImpShare'] = kwData[uId]['perTA']['DayImpShare'];
      }

      // If there is no good data on Impression Share anywhere, take 100%
      else {
        Logger.log("No good data found. We will use 100%");
        kwData[uId]['perT']['DayImpShare'] = 1;
      }
    }
  }



  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // FOR EACH KW, CHECK WHETHER WE HAVE ENOUGH CLICKS IN THE PERIODS SO WE
  // CAN MAKE A COMPARISON. AND WE ADD THE DATA OF THE PREVIOUS DAY TO TA
  // OR TB ACCORDINGLY

  // Check for each KW we have
  for (var uId in kwData) {

    // First, if dataTA is empty, this means this is the first loop for this KW
    // In this case, take dataT and copy it into dataTA
    if (kwData[uId]['perTA']['DayClicks'] == -100) {
      Logger.log ("First loop for Keyword: " + uId);
      // We update the kwData[uId]['perTA']
      var period = "perTA";
      kwData[uId] = fillPeriodsData(kwData[uId], period);
    }

    // If dataTA does not have enough clicks, add dataT to TA, write the data in
    // the file.
    else if (kwData[uId]['perTA']['DayClicks'] < minClicks) {
      Logger.log ("Keyword: " + uId + " does not have enough clicks in TA.");
      // We update the kwData[uId]['perTA']
      var period = "perTA";
      kwData[uId] = addTwoPeriodsData(kwData[uId], period);
    }

    // if dataTA has enough clicks, we need to:
    // - Add dataT to TB

    // If it is the first time we add data to TB:

    else if (kwData[uId]['perTB']['DayClicks'] == -100) {
      Logger.log ("Keyword: " + uId + " has enough clicks in TA.");
      Logger.log ("Adding dataT to TB for the first time");
      // We update the kwData[uId]['perTA']
      var period = "perTB";
      kwData[uId] = fillPeriodsData(kwData[uId], period);
    }

    // And if there is already data in TB, we add

    else {
      Logger.log ("Keyword: " + uId + " has enough clicks in TA.");
      Logger.log ("Adding dataT to TB");
      // We update the kwData[uId]['perTA']
      var period = "perTB";
      kwData[uId] = addTwoPeriodsData(kwData[uId], period);
    }
  }

  Logger.log(kwData);



  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // NOW, IF WE HAVE ENOUGH CLICKS IN TA AND IN TB, WE CAN COMPARE BOTH PERIODS
  // AND CHANGE THE CPCMAX ACCORDINGLY.

  // IN ADDITION, IF A KW HAS ENOUGH CLICKS IN TA, AND THE NEXT TIME WILL
  // ADD TO TB AND IT IS THE FIRST TIME THIS HAPPENS, WE NEED TO CHANGE THE CPCMAX

  // Check for each KW we have
  for(var uId in kwData) {

    // 1. IF PERTA AND PERTB HAVE BOTH ENOUGH CLICKS
    if (kwData[uId]['perTA']['DayClicks'] >=  minClicks &&
        kwData[uId]['perTB']['DayClicks'] >=  minClicks) {

        // Calculate "Esperanza de Margen Neto" for TA and TB
        kwData[uId]['perTA']['EMNNorm'] = calculateEMNNorm (kwData[uId], "perTA");
        kwData[uId]['perTB']['EMNNorm'] = calculateEMNNorm (kwData[uId], "perTB");

        Logger.log("EMNNormA: " + kwData[uId]['perTA']['EMNNorm']);
        Logger.log("EMNNormB: " + kwData[uId]['perTB']['EMNNorm']);

        // Calculate the new CPCmax for the KW
        kwData[uId]['perTPlus1']['CpcMax'] = calculateCpcMax(kwData[uId]);
    }

    // 2. IF PERTA HAS ENOUGH CLICKS AND IT IS THE FIRST LOOP OF THIS KW
    // This means that this is the
    // first time for this KW to reach enough clicks in TA and that in the next
    // loop, they will move to add to TB. In this case, we need to force a change
    // in the CPCmax. Otherwise, we would have a period a and a period B with
    // with the same CPCmax. We could not compare
    else if (kwData[uId]['perTA']['DayClicks'] >=  minClicks &&
             kwData[uId]['perTB']['DayClicks'] ==  -100) {

    Logger.log("The Keyword: " + uId + " has reached enough clicks in TA. " +
      "We will change CPCmax to be able to compare with period TB");

    // First, calculate the EMN for TA
    kwData[uId]['perTA']['EMNNorm'] = calculateEMNNorm (kwData[uId], "perTA");

    // Now check the sign of EMN. If it is positive, add 0.2. If it is negative
    //  deduct 0.2
      if (kwData[uId]['perTA']['EMNNorm'] >= 0 ) {
        kwData[uId]['perTPlus1']['CpcMax'] = kwData[uId]['perT']['CpcMax'] + 0.2;
      }
      else if (kwData[uId]['perTA']['EMNNorm'] < 0 ) {
        kwData[uId]['perTPlus1']['CpcMax'] = kwData[uId]['perT']['CpcMax'] - 0.2;
      }
      else {
        kwData[uId]['perTPlus1']['CpcMax'] = kwData[uId]['perT']['CpcMax'];
        Logger.log("There is a problem with the calculation of EMN");
      }
    }

    // 3. IF WE DO NOT HAVE ENOUGH CLICKS FOR ANY OF THE PERIODS
    // In this case, we will leave the CPCmax as it is now
    else {
      kwData[uId]['perTPlus1']['CpcMax'] = kwData[uId]['perT']['CpcMax'];
      Logger.log("The Keyword: " + uId + " does not have enough clicks " +
        "in perTA or perTB to perform the comparison of EMN");
    }
  }


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
  // SEND INFORMATION TO GOOGLE SHEET

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
                    'Unique ID',
                    'Keyword',
                    'Campaign Name',
                    'AdGroup Name',
                    'Current CPCMax',
                    'New CPCMax',
                    'CPCMax A',
                    'Imp A',
                    'Imp Share A',
                    'Clicks A',
                    'Cost A',
                    'EMNNorm A',
                    'Days A',
                    'CPCMax B',
                    'Imp B',
                    'Imp Share B',
                    'Clicks B',
                    'Cost B',
                    'EMNNorm B',
                    'Days B'

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
      toPrint[i][2] = uId;
      toPrint[i][3] = kwData[uId]['Kw'];
      toPrint[i][4] = kwData[uId]['CampaignName'];
      toPrint[i][5] = kwData[uId]['AdGroupName'];

      toPrint[i][6] = kwData[uId]['perT']['CpcMax'];
      toPrint[i][7] = kwData[uId]['perTPlus1']['CpcMax'];

      toPrint[i][8] = kwData[uId]['perTA']['CpcMax'];
      toPrint[i][9] = kwData[uId]['perTA']['DayImpressions'];
      toPrint[i][10] = kwData[uId]['perTA']['DayImpShare'];
      toPrint[i][11] = kwData[uId]['perTA']['DayClicks'];
      toPrint[i][12] = kwData[uId]['perTA']['DayCGAds'];
      toPrint[i][13] = kwData[uId]['perTA']['EMNNorm'];
      toPrint[i][14] = kwData[uId]['perTA']['nbDays'];

      toPrint[i][15] = kwData[uId]['perTB']['CpcMax'];
      toPrint[i][16] = kwData[uId]['perTB']['DayImpressions'];
      toPrint[i][17] = kwData[uId]['perTB']['DayImpShare'];
      toPrint[i][18] = kwData[uId]['perTB']['DayClicks'];
      toPrint[i][19] = kwData[uId]['perTB']['DayCGAds'];
      toPrint[i][20] = kwData[uId]['perTB']['EMNNorm'];
      toPrint[i][21] = kwData[uId]['perTB']['nbDays'];

      i++;

    }

    Logger.log("Matrix has been created");

  // Send information to Google Sheet

  writeDataToSpreadsheet(spreadsheetUrl, sheetName, toPrint, colHeaders)

  Logger.log("Spreadsheet has been updated");


  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // NOW, CHECK EVERY KW. FOR THE KWS WHERE WE HAD TWO FULL PERIODS AND WE HAVE
  // COMPARED EMNS, WE NEED TO CHANGE THE PERIODS. PERIOD BE WILL BECOME
  // PERIOD A AND PERIOD A WILL BE DELETED

  // Check for each KW we have
  for(var uId in kwData) {
    // Check that periodA and periodB have both enough clicks
    if (kwData[uId]['perTA']['DayClicks'] >=  minClicks &&
        kwData[uId]['perTB']['DayClicks'] >=  minClicks) {

      // As we have changed the CPCMax, the current periodB will become the new
      //  periodA. First copy periodB values into periodA. Then delete periodB
      // values
      for(var variable in kwData[uId]['perTA']) {
          kwData[uId]['perTA'][variable] = kwData[uId]['perTB'][variable];
          kwData[uId]['perTB'][variable] = -100;
      }
    }
  }


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
    // NOW WRITE THE FILE THAT WILL STORE THE INFORMATION FOR THE NEXT RUNNING OF THE
    // SCRIPT

    // uId1: {Kw:, CampaignName, AdGroupName,
    //       perT: {CpcMax: , DayImpressions, DayImpShare : , DayClicks: , DayCGAds: ,
    //              KwCR30: , AdGCR30: },
    //       perTA: {CpcMax: , DayImpressions, DayImpShare : , DayClicks: , DayCGAds: ,
    //               EMNNorm: , nbDays},
    //       perTB: {CpcMax: , DayImpressions, DayImpShare : , DayClicks: , DayCGAds: ,
    //              EMNNorm: , nbDays},
    //       perTPlus1: {CpcMax: }}


    // First, create the string that we will send to the file
    var results = [];

    for(var uId in kwData){

      var resultsRow = [uId,
                        kwData[uId]['perTA']['CpcMax'],
                        kwData[uId]['perTA']['DayImpressions'],
                        kwData[uId]['perTA']['DayImpShare'],
                        kwData[uId]['perTA']['DayClicks'],
                        kwData[uId]['perTA']['DayCGAds'],
                        kwData[uId]['perTA']['EMNNorm'],
                        kwData[uId]['perTA']['nbDays'],

                        kwData[uId]['perTB']['CpcMax'],
                        kwData[uId]['perTB']['DayImpressions'],
                        kwData[uId]['perTB']['DayImpShare'],
                        kwData[uId]['perTB']['DayClicks'],
                        kwData[uId]['perTB']['DayCGAds'],
                        kwData[uId]['perTB']['EMNNorm'],
                        kwData[uId]['perTB']['nbDays']
                        ];

      results.push(resultsRow.join(fieldJoin));
    }

    results = results.join(lineJoin);
    Logger.log("Los datos para la nueva file son: ");
    Logger.log(results);

    // Now, send the new content to the data file
    file.setContent(results);

    Logger.log("The data file has been created");

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

// IF WE HAVE IDENTIFIED ANY ISSUE, SEND THE EMAIL

  if (issuesList.length > 0) {sendWarningEmail(recipients, issuesList);}

  Logger.log("Script has been completed");

}

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//




  // Functions


  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

function fillPeriodsData(kwDataUId, period) {
  // copy the data from periodT to period
  // kwDatauId: Data of a given uId (object)
  // period: either perTA or perTB
  // Returns reviewed kwData[uId]

    kwDataUId[period]['CpcMax'] = kwDataUId['perT']['CpcMax'];
    kwDataUId[period]['DayImpShare'] =  kwDataUId['perT']['DayImpShare'];
    kwDataUId[period]['DayImpressions'] = kwDataUId['perT']['DayImpressions'];
    kwDataUId[period]['DayClicks'] = kwDataUId['perT']['DayClicks'];
    kwDataUId[period]['DayCGAds'] = kwDataUId['perT']['DayCGAds'];

    // For nbDays, we just add one
    kwDataUId[period]['nbDays'] = 1;

    return kwDataUId;
}



  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

function addTwoPeriodsData(kwDataUId, period) {
  // Adds the gAds data of two periods
  // kwDataUId: Data of a given uId (object)
  // period: either perTA or perTB
  // Returns reviewed kwDataUId

  kwDataUId[period]['CpcMax'] = kwDataUId[period]['CpcMax'];
  // New DayImpshare is the weighted avg of the previous ones
  // If the two periods are of zero impressions, then, the ImpShare will be 0
  if(kwDataUId[period]['DayImpressions'] == 0 &&
     kwDataUId['perT']['DayImpressions'] == 0) {
      kwDataUId[period]['DayImpShare'] = 0;
  }
  // Otherwise, take the weighted average
  else {
  kwDataUId[period]['DayImpShare'] =
   (kwDataUId[period]['DayImpShare'] * kwDataUId[period]['DayImpressions'] +
   kwDataUId['perT']['DayImpShare'] * kwDataUId['perT']['DayImpressions']) /
   (kwDataUId[period]['DayImpressions'] + kwDataUId['perT']['DayImpressions']);
 }

    // For DayImpressions, Clicks and Cost, we just add
    kwDataUId[period]['DayImpressions'] += kwDataUId['perT']['DayImpressions'];
    kwDataUId[period]['DayClicks'] += kwDataUId['perT']['DayClicks'];
    kwDataUId[period]['DayCGAds'] += kwDataUId['perT']['DayCGAds'];

    // For nbDays, we just add one
    kwDataUId[period]['nbDays']++;

    return kwDataUId;
}


  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

function calculateEMNNorm (kwDataUId, per) {
// Calculates the "esperanza de Margen Neto Normalizado"
// kwDataUId: kwData for a given uId. Object
// per: Period. String
// Return EMNNorm

  // First, check if we have the minimum number of conversions at KW or at
  // AdG level, and decide which CR you will use



  var convRate = 0;
  Logger.log("The keyword " + kwDataUId['Kw']);
  Logger.log("KWConv30: " + kwDataUId['perT']['KwConv30']);


  if (kwDataUId['perT']['KwConv30'] >= minConv) {
    convRate = kwDataUId['perT']['KwCR30'];
    Logger.log("The keyword " + kwDataUId['Kw'] + " will use KW-level conversions");
  }
  else if (kwDataUId['perT']['AdGConv30'] >= minConv) {
    convRate = kwDataUId['perT']['AdGCR30'];
    Logger.log("The keyword " + kwDataUId['Kw'] + " will use AdG-level conversions");
  }
  else if (kwDataUId['perT']['AdGConv30']){
    convRate = kwDataUId['perT']['AdGConv30'];
    Logger.log("Attention! The keyword " + kwDataUId['Kw'] + " does not have enough conversions" +
      " in the last 30 days to have an accurate forecast of the conversion rate");
  }
  else {
    ("Attention! There is an error 6 in the script");
    return;
  }


  // Calculate the EMN
  var EMN = kwDataUId[per]['DayClicks'] * convRate * kwIncomePerLead[kwDataUId['CampaignName']] -
    kwDataUId[per]['DayCGAds'];

  Logger.log("KW: " + kwDataUId['Kw']);
  Logger.log("Periodo:" + per);
  Logger.log("Clicks: " + kwDataUId[per]['DayClicks']);
  Logger.log("Conversion Rate: " + convRate);
  Logger.log("KWIncomePerLead: " + kwIncomePerLead[kwDataUId['CampaignName']]);
  Logger.log("Cost:" + kwDataUId[per]['DayCGAds']);
  Logger.log("EMN" + EMN);

  // EMN Normalised is the EMN normalised for a given number of potential impressions
  // We use this trick to be able to compare the EMN for different days or groups of
  // days that have a different number of potential impressions
  var potImp = kwDataUId[per]['DayImpressions'] / kwDataUId[per]['DayImpShare'];
  var EMNNorm = EMN / potImp;

Logger.log("potential impressions: " + potImp);
Logger.log("EMNNorm: " + EMNNorm);

  return EMNNorm;
}



  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//


function calculateCpcMax(kwDataUI) {
// Function to calculate the CPCMax for the next loop.
// CkwDataUId: Data of a given uId (object)
// RETURN: Floating point value with the new CPCMax

  var EMNNormA = kwDataUI['perTA']['EMNNorm'];
  var EMNNormB = kwDataUI['perTB']['EMNNorm'];
  var CpcMaxA = kwDataUI['perTA']['CpcMax'];
  var CpcMaxB = kwDataUI['perTB']['CpcMax'];
  var CpcMax = kwDataUI['perT']['CpcMax'];

  // First, if EMNNormB is less than 0, this means we are losing money.
  // If this is the case, reduce the CPCmax 0.5

  if (EMNNormB <= 0) { cpcMaxPlus1 = CpcMax - 0.05; }

  // Otherwise, calculate the slope of the line EMN - CpcMax, and change
  // the Cpcmax accordingly
  else {

    var slope = (EMNNormB - EMNNormA) / (CpcMaxB - CpcMaxA);

    if (slope >= 0 ) { cpcMaxPlus1 = CpcMax + 0.05; }
    else { cpcMaxPlus1 = CpcMax - 0.05; }

  }
  // Finally, check that our new CPCmax is not higher than our MaxBid, lower
  // than our MinBid

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

  function keyworduId(keyword, ids, uIdList, idJoin) {
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
  range.setValues(data);
  Logger.log(data);
}

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

function addIssue(issuesList, issueId) {
  // Function to add an issue to the IssuesList
  // issuesList: List with all the types of errors / Warnings (Array of strings)
  // issueID: Issue Identifier (string)
  // RETURN: new issuesList (array of strings)

  // First define the the warning message associated to each issue
  var issuesMatrix = {};
  issuesMatrix['issueW01'] = {};
  issuesMatrix['issueW01']['Message'] = "The script could not read the Impression Share of one or several KWs";

  // Check if the identified issue text is already in the array. If it is not, add it
  var issueExists = false;
  for(var i=0; i<issuesList.length; i++) {
    if(issuesList[i] == issuesMatrix[issueId]['Message']) {issueExists = true;}
  }
  if (issueExists == false) {issuesList.push(issuesMatrix[issueId]['Message']);}

  return issuesList;
}

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

function sendWarningEmail(recipients, issuesList) {
  // Function to send an email with a warning message if there is a problem
  //  with the algorithm
  // recipients: List of email recipients (Array)
  // issuesList: List with all the types of errors / Warnings (Array of integers)
  // RETURN: Nothing

  var name = AdWordsApp.currentAccount().getName();
  var subject = "ATTENTION. Warnings and alerts of GAds account: " + name;
  var body = "The warnings and alarms that the system has detected are: \n";
  body += issuesList.join("\n");
  MailApp.sendEmail(recipients.join(","),subject,body);
  Logger.log(body);
  Logger.log("Email sent to " + recipients.join(", "));
}

}
