function remoteScript () {

  /************************************
  * Manage CPCMax in ADESLAS Regulated KWs Simple
  * Version 1.0
  * 26/05/2019
  * Written By: Pablo Marco
  *
  * Goal: Manage CPCmax of the regulated KWs, based on
  * performance of the KW during this day
  * ChangeLog:
  *  	No changes
  *
  **************************************/



  // Options

  var spreadsheetUrl = "xxxxxxx";
  // URL of the Spreadsheet where we record the log

  var hourStart = 10;
  // First hour when we will run the algorithm

  var hourEnd = 20;
  // Last hour when we will run the algorithm

  // The label we will use is "cpclim xx" xx being the value of the limit CPC
  // defined by ADESLAS

  var riskLevel = 3;
  // riskLevel represents the probability of exceeding the CPClim.
  // It is how many clics in the new CPCbid the KW receives before it exceeds the CPClim
  // This means that the higher the value, the less likely we will exceed the CPClim, but
  // the most conservative the bids will be, therefore getting fewer clics.

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

this.main = function () {


    var fieldJoin = ",";
    var lineJoin = "$";
    var idJoin = "#";

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

    // First of all, check what time is it. If it is the time when telephone operators are not working,
    // just do not run the algorithm.
    // But the hour after when the operators stop and the hour before they start, we keep the program on, in
    //  order to bring CPCmax back to the start value (CPCmax = CPClim)

    // programMode defines the mode the program will be running
    //  -1: Error mode. There is a problem. Stop the program
    //   0: Pause mode. The program will not run
    //   1: Reset mode. Bringing CPCmax values back to CPCml
    //   2: Action mode. Playing with the CPCmax value to maximixe CPCmd
    var programMode = -1;

    // Calculate Current Hour
    var currentHour = parseInt(Utilities.formatDate(new Date(), AdWordsApp.currentAccount().getTimeZone(), "HH"), 10);

    // If current hour is not between hourStart and hourEnd -1, send a warning message and stop
    if (currentHour < (hourStart) || currentHour > (hourEnd + 1)) {
      Logger.log("Current hour is " + currentHour + ". Out of working time. Program stopped.");
      programMode = 0;
      return;
    // If it is one hour after the operators end, run the program in "Reset mode"
  } else if (currentHour == (hourEnd + 1)) {
        Logger.log("Current hour is " + currentHour + ". Working in reset mode. Setting values to 'Night Mode'");
        programMode = 1;


    // If it is in the range of hours when the operator works, run the program in "Action mode"
    } else if (currentHour >= (hourStart) && currentHour <= (hourEnd)) {
        Logger.log("Current hour is " + currentHour + ". Working in Action mode. Playing with CPCmax");
        programMode = 2;
    }

    // Security check
    if (programMode == -1) {
      Logger.log ("ATTENTION. There is an error in the program. Program will stop");
      return;
    }

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

    // EXTRACT INFORMATION FROM THE LABEL cpclim

    // Create vector to Store the Position Labels
    var labelIds = [];

    // Define Label Iterator
    var labelIterator = AdWordsApp.labels()
    .withCondition("KeywordsCount > 0")
    .withCondition("LabelName CONTAINS_IGNORE_CASE 'cpclim '")
    .get();

    // Store all the KW Labels that have the text "cpclim"
    while (labelIterator.hasNext()) {
      var label = labelIterator.next();
      if (label.getName().substr(0,"cpclim ".length).toLowerCase() == "cpclim ") {
        labelIds.push(label.getId());
      }
    }

    if (labelIds.length == 0) {
      Logger.log("No CPClim labels found.");
      return;
    }
    Logger.log(labelIds.length + " CPClim labels have been found.");

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

    // Define the Structure of the Object keywordData

    var keywordData = {
      //UniqueId1: {Kw: , CPCBid: , CPCmd: , CPClim: , Clicks: }
    }

    var ids = [];
    var uniqueIds = [];

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

    // Create the report that extracts the information of the KWs
    var report = AdWordsApp.report(
      'SELECT Id, Criteria, AdGroupId, AdGroupName, CampaignName, Impressions, AveragePosition, CpcBid, FirstPageCpc, Labels, BiddingStrategyType, AverageCpc, Clicks ' +
      'FROM KEYWORDS_PERFORMANCE_REPORT ' +
      'WHERE Status = ENABLED AND AdGroupStatus = ENABLED AND CampaignStatus = ENABLED ' +
      'AND LabelIds CONTAINS_ANY [' + labelIds.join(",") + '] ' +
      'AND AdNetworkType2 = SEARCH ' +
      'DURING TODAY'
        );

    var rows = report.rows();

    // Start the iteration on all the KWs
    while(rows.hasNext()){
      var row = rows.next();
      //Check that the Bidding Strategy is CPC Manual. Otherwise skip or warn
      if (row["BiddingStrategyType"] != "cpc") {
        if (row["BiddingStrategyType"] == "Enhanced CPC"
            || row["BiddingStrategyType"] == "Target search page location"
            || row["BiddingStrategyType"] == "Target Outranking Share"
            || row["BiddingStrategyType"] == "None"
            || row["BiddingStrategyType"] == "unknown") {
          Logger.log("Warning: keyword " + row["Criteria"] + "' in campaign '" + row["CampaignName"] +
                     "' uses '" + row["BiddingStrategyType"] + "' rather than manual CPC. This may overrule keyword bids and interfere with the script working.");
        } else {
          Logger.log("Warning: keyword " + row["Criteria"] + "' in campaign '" + row["CampaignName"] +
                     "' uses the bidding strategy '" + row["BiddingStrategyType"] + "' rather than manual CPC. This keyword will be skipped.");
          continue;
        }
      }

      var positionTarget = "";
      var maxBidLabel = "";

      if (row["Labels"].trim() == "--") {
        continue;
      }
      var labels = JSON.parse(row["Labels"].toLowerCase()); // Labels are returned as a JSON formatted string

      // Extract the number in the "cpclim" label
      for (var i=0; i<labels.length; i++) {
        // If the KW has a "cpclim" label, then then take the number
        if (labels[i].substr(0,"cpclim ".length) == "cpclim ") {
          var cpclimValue = parseFloat(labels[i].substr("cpclim ".length-1).replace(/,/g,"."),10);
        }

      }

      // Integrity Check of cpclimValue. If there is an error, there will be an error message and there will be no creation of info for this KW
        if (integrityCheckCpclimValue(cpclimValue) == -1) {
          Logger.log("Invalid value for CPC Limit '" + cpclimValue +  "' for keyword '" + row["Criteria"] + "' in campaign '" + row["CampaignName"] + "'");
          continue;
        }

      // Create Unique ID for each KW
      ids.push(parseFloat(row['Id'],10));
      var uniqueId = row['AdGroupId'] + idJoin + row['Id'];
      uniqueIds.push(uniqueId);

      // Fill the data of keywordData
      keywordData[uniqueId] = {};

      // Fill data from the GAds Report
      keywordData[uniqueId]['CPCmd'] = parseFloat(row['AverageCpc'].replace(/,/g,""),10); // Directly from the GAds report
      keywordData[uniqueId]['CpcBid'] = parseFloat(row['CpcBid'].replace(/,/g,""),10); // Idem
      keywordData[uniqueId]['Clicks'] = parseFloat(row['Clicks'].replace(/,/g,""),10); // Idem
      keywordData[uniqueId]['CPClim'] = cpclimValue; // Previously extracted from the labels


      // We recreate the format of KW as they appear in GAds
      keywordData[uniqueId]['Kw'] =  (row.KeywordMatchType === 'Exact') ? '['+row.Criteria+']' :
                                 (row.KeywordMatchType === 'Phrase') ? '"'+row.Criteria+'"' :
                                 row.Criteria;

      }

    Logger.log(uniqueIds.length + " labelled keywords found");
    Logger.log(uniqueIds);

    Logger.log(keywordData);
    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//


  // Here we modify the CPCmax of each KWs, based on the day data and the defined criteria
  // ATTENTION! If we hav more than 5,000 KWs, we need to batch (see Position script BL)

  // Loop through all the keywords that we have

    // The keywordIterator collects all the keyword IDs we have in unique Ids
    var keywordIterator = AdWordsApp.keywords()
    .withIds(uniqueIds.map(function(str){return str.split(idJoin);}))
    .get();

    // Now, we loop through each one of them
    while(keywordIterator.hasNext()){
      var keyword = keywordIterator.next();

      // We re-calculate the value of unique Id
      var uniqueId = keyword.getAdGroup().getId() + idJoin + keyword.getId()


      // Now, we are going to calculate the new CPCmax
      // We will store the value in newBid
      // Default value is newBid = -1, which means there is an error
      // If there is no need to change current bid, the value will be newBid = -2

      var newBid = -1;

      // Extract the needed data from keywordData
      var cpcmd = keywordData[uniqueId]['CPCmd'];
      var cpclim = keywordData[uniqueId]['CPClim'];
      var cpcbid = keywordData[uniqueId]['CpcBid'];
      var clicks = keywordData[uniqueId]['Clicks'];

       // Print the key data of the KW in the GAds Log
      Logger.log("");
      Logger.log("Keyword: " + keywordData[uniqueId]['Kw']);
      Logger.log("Avg CPC = " + cpcmd + ". CPClim = " + cpclim + ". CPCMax = " + cpcbid);

      // Here we insert the criteria for the change of the CPCmax

      // If we are in "Reset mode", we want to bring CPCmax to a lower point than
      // CPClim, so we can gain clicks with a low CPC that will allow us to have a
      // CPCmax way higher than CPClim during the operators' working hours
      // For the time being, we bring the CPCmax to CPClim x 0,6 in this period

      if (programMode == 1) {
        // If cpcbid = cpclim, no need to change anything
        if (cpcbid == cpclim) {
          newBid = -2;
        // Otherwise, bring CPCmax back to the cpclim
        } else {
          newBid = cpclim;
        }

      // If we are in active mode:
      } else if (programMode == 2) {
          // If cpcmd = 0, this means we did not have clics today
          // If, in addition, cpcbid = cpclim, all normal, no need to change bid
          if (cpcmd == 0 && cpcbid == cpclim) {
            newBid = -2;
          // But if cpcbid > cpclim, this means there was an error. Bring back to cpclim
        } else if (cpcmd == 0 && cpcbid !== cpclim) {
              Logger.log ("Acg CPC = 0 and CPCmax is set higher than CPC Limit. POSSIBLE ERROR. PLEASE CHECK");
              Logger.log ("We bring CPCmax back to CPClim");
              newBid = cpclim;


            // HERE IS WHERE WE INSERT CRITERIA FOR CHANGING CPCMAX!!
            // If cpcmd != 0, this means we have had bids
            // If cpcmd = cpclim, CPCbid should be equalized to cpclim (wheter it is now or it is not)
          } else if (cpcmd == cpclim) {
              newBid = cpclim;
              Logger.log("CPCmd Igual a CPClim");
            // If cpcmd is smaller than cpcmd, we can introduce the formula to calculate the CPCbid
            // Please see explanation in the introduction
          } else if (cpcmd < cpclim) {
              newBid = cpclim * ((clicks + riskLevel) / (riskLevel)) - clicks / riskLevel * cpcmd;
              Logger.log("CPCmd menor que CPClim");
            // If cpcmd > cpclim, there is a potential error!!
          } else if (cpcmd > cpclim){
              newBid = cpclim;
              Logger.log ("AVERAGE CPC HIGHER THAN LIMIT. POTENTIAL ERROR. REVIEW");
              Logger.log("CPCmd mayor que CPClim");
          }
        }

        // SECURITY CHECKs AND BID CHANGE

        // If newBid = -1, this means there was an error. Stop
        if (newBid == -1 ) {
          Logger.log ("THERE IS AN ERROR IN THE BID SELECTION. PROGRAM STOPPED. PLEASE REVIEW");
          return;

        // If newBid = -2, this means there is no change in the CPCmax
        } else if (newBid == -2 ) {

        // Update the keyword with the new bids.
        } else if (newBid !== -2 ) {
          keyword.setMaxCpc(newBid);
  		Logger.log ("The new CPCmax is: " + newBid + ".");
        }
    }


    Logger.log("Finished.");

  }
    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//



    // Functions

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

    // Checks that the Position Label has a valid value
    //  1. It is a number
    //  2. It is larger than 0
    function integrityCheckCpclimValue(target){
      var n = parseFloat(target, 10);
      if(!isNaN(n) && n > 0){
        return n;
      }
      else{
        return -1;
      }

    }

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//



} // De Function remoteScript
