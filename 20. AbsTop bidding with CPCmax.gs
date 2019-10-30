function remoteScript () {

/************************************
* Top of Page bidding
* Version 1.0
* 18/09/2019
* Owned by: Pablo Marco

*
* Goal: This script changes de KW bid based on the
*	target Search Absolut Impression Share selected by the user and entered in a label in the KW
*	We have added a second label in the KW to define the CPCMax
*
*

* Version: 1.2
* ChangeLog:
* 1.1. 15/10/2019: Now, if there is no MaxBid Label, we will take the maxBidDefault as value
* 1.2. 25/10/2019: Algo will not run on Sunday and Monday
*
*
* Instructions
* - User will indicate in the label the percentage of impressions in Top of Page or in
*     Absolute Top of Page writing in the label TOP or ATOP and the percentage
* - For example TOP 95 or ATOP 80


**************************************/




// Options

var maxBidDefault = 5.00;
// Bids will not be increased past this maximum.
// If there is a label with maxBid, the value of the label will override

var minBid = 0.15;
// Bids will not be decreased below this minimum.

var firstPageMaxBid = 3.00;
// The script avoids reducing a keyword's bid below its first page bid estimate. If you think
// Google's first page bid estimates are too high then use this to overrule them.

var useFirstPageBidsOnKeywordsWithNoImpressions = true;
// If this is true, then if a keyword has had no impressions since the last time the script was run
// its bid will be increased to the first page bid estimate (or the firsPageMaxBid if that is smaller).
// If this is false, keywords with no recent impressions will be left alone.

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

// Advanced Options
var bidIncreaseProportion = 0.4; // For example, 0.5 means max increase is 0.25 X cpcmax.
var bidDecreaseProportion = 0.4; // For example, 0.5 means max decrease is 0.25 X cpcmax.
var targetTolerance = 0.03; // Tolerance between Target and Real (between 0 (0%) and 0.5 (50%))

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

this.main = function () {

  var fieldJoin = ",";
  var lineJoin = "$";
  var idJoin = "#";



  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // If we are on Sunday or Monday, do not run the algorithm,
  // As the algorithm takes info from the previous days (Saturday and Monday),
  // when the campaigns are off or "confusing"

  var currentTime = new Date();
  var weekDayToday = Utilities.formatDate(currentTime,
    AdWordsApp.currentAccount().getTimeZone(), "u");


  if (weekDayToday == 1 || weekDayToday == 7) {
    Logger.log("Ayer fue sábado o domingo, por lo que el algoritmo no funcionará hoy.");
    return;
  }



  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // EXTRACT INFORMATION FROM THE LABELS TOP OR ATOP

  // Create vector to Store the Position Labels
  var labelIds = [];

  // Define Label Iterator
  var labelIterator = AdWordsApp.labels()
  .withCondition("KeywordsCount > 0")
  .withCondition("LabelName CONTAINS_IGNORE_CASE 'Top '")
  .get();

  // Store all the KW Labels that have the text "top" or "atop"
  while (labelIterator.hasNext()) {
    var label = labelIterator.next();
    if (label.getName().substr(0,"top ".length).toLowerCase() == "top " ||
        label.getName().substr(0,"atop ".length).toLowerCase() == "atop "  ) {
      labelIds.push(label.getId());
    }
  }

  if (labelIds.length == 0) {
    Logger.log("No TOP or ATOP labels found.");
    return;
  }
  Logger.log(labelIds.length + " TOP and ATOP labels have been found.");




  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // Define the Structure of the Object keywordData
  var keywordData = {
    //REVISAR UniqueId1: {LastHour: {Impressions: , AveragePosition: }, ThisHour: {Impressions: , AveragePosition: },
    //REVISAR pcBid: , FirstPageCpc: , MaxBid, MinBid, FirstPageMaxBid, PositionTarget: , CurrentAveragePosition:,
    //REVISAR Criteria: }
  }

  var ids = [];
  var uniqueIds = [];

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // Create the report that extracts the information of the KWs
  var report = AdWordsApp.report(
    'SELECT Id, Criteria, AdGroupId, AdGroupName, CampaignName, Impressions,' +
      'AbsoluteTopImpressionPercentage, TopImpressionPercentage, CpcBid,' +
      'FirstPageCpc, Labels, BiddingStrategyType ' +
    'FROM KEYWORDS_PERFORMANCE_REPORT ' +
    'WHERE Status = ENABLED AND AdGroupStatus = ENABLED AND CampaignStatus = ENABLED ' +
    'AND LabelIds CONTAINS_ANY [' + labelIds.join(",") + '] ' +
    'AND AdNetworkType2 = SEARCH ' +
    'DURING YESTERDAY'
      );

  var rows = report.rows();

  // Start the iteration on all the KWs
  while(rows.hasNext()) {
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

    var topTarget = -1;
    var aTopTarget = -1;
    var maxBidLabel = -1;


    // IF "Labels" is empty, jump to the next KW
    if (row["Labels"].trim() == "--") {
      continue;
    }
    // Erase the "" and bring all words in "Labels" to lowercase
    var labels = JSON.parse(row["Labels"].toLowerCase()); // Labels are returned as a JSON formatted string


    // Extract the number in the "Top", "ATop" and "MAxbid" labels
    for (var i=0; i<labels.length; i++) {
      // If the KW has a "Top" label, then then take the number
      if (labels[i].substr(0,"top ".length) == "top ") {
        var topTarget = parseFloat(labels[i].substr("top ".length-1).replace(/,/g,"."),10);
      }
      // If the KW has a "ATop" label, then then take the number
      if (labels[i].substr(0,"atop ".length) == "atop ") {
        var aTopTarget = parseFloat(labels[i].substr("atop ".length-1).replace(/,/g,"."),10);
      }
      // If the KW has a "Maxbid" label, then take the number.
      if (labels[i].substr(0,"maxbid ".length) == "maxbid ") {
        maxBidLabel = parseFloat(labels[i].substr("maxbid ".length-1).replace(/,/g,"."),10);
      }
      // If there is no Maxbid Label, we will take the maxBidDefault as value
      else {
      maxBidLabel = maxBidDefault;
      }
    }



    // Multiple Checks:
    //  - If there in no topTarget nor aTopTarget -> Do no create the data for this KW, jump to the next KW
    //  - If there is positionTarget:
    //    - Check integrity PositionTarget
    //    - If there is maxBid, check it

    if (topTarget == "" && aTopTarget == "") {
      continue;
    }

    // Integrity Check of topTarget and aTopTarget. If there is an error, there
    //   will be an error message and there will be no creation of info for this KW
      if (integrityCheckTopTarget(topTarget) == -1 &&
           integrityCheckTopTarget(aTopTarget) == -1) {
        Logger.log("Invalid target '" + topTarget + " " + aTopTarget +
          "' for keyword '" + row["Criteria"] + "' in campaign '" + row["CampaignName"] + "'");
        continue;
      }

    // Integrity Check. If the MaxBid is wrong, there will be an error message, and there will be no creation of info for this KW
    if (maxBidLabel !== "") {
      if (integrityCheckMaxBid(maxBidLabel) == -1) {
        Logger.log("Invalid Max Bid '" + maxBidLabel +  "' for keyword '" + row["Criteria"] + "' in campaign '" + row["CampaignName"] + "'");
        Logger.log("This keyword will not update the CPC until this error is solved.")
        continue;
      }
    }

    // Create Unique ID for each KW
    ids.push(parseFloat(row['Id'],10));
    var uniqueId = row['AdGroupId'] + idJoin + row['Id'];
    uniqueIds.push(uniqueId);

    // Fill the data of keywordData
    keywordData[uniqueId] = {};
    keywordData[uniqueId]['Criteria'] = row['Criteria'];


    keywordData[uniqueId]['Impressions'] = parseFloat(row['Impressions'].replace(/,/g,""),10);

    // For "ATopImpPer", if the data is <10%, we keep it like that. Otherwise, we do the usual
    if (row['AbsoluteTopImpressionPercentage'] == "< 10 %") {
      keywordData[uniqueId]['ATopImpPer'] = "< 10 %";
    }
    else {
      keywordData[uniqueId]['ATopImpPer'] = parseFloat(row['AbsoluteTopImpressionPercentage'].replace(/,/g,""),10);
    }

    // For "TopImpPer", if the data is <10%, we keep it like that. Otherwise, we do the usual
    if (row['TopImpressionPercentage'] == "< 10 %") {
      keywordData[uniqueId]['TopImpPer'] = "< 10 %";
    }
    else {
      keywordData[uniqueId]['TopImpPer'] = parseFloat(row['TopImpressionPercentage'].replace(/,/g,""),10);
    }

    keywordData[uniqueId]['CpcBid'] = parseFloat(row['CpcBid'].replace(/,/g,""),10);
    keywordData[uniqueId]['FirstPageCpc'] = parseFloat(row['FirstPageCpc'].replace(/,/g,""),10);
    keywordData[uniqueId]['MinBid'] = minBid;
    keywordData[uniqueId]['FirstPageMaxBid'] = firstPageMaxBid;

    // Fill the data of maxBid. Take the number from the label.
    // Otherwise, take the default
    if (maxBidLabel == "") {
      keywordData[uniqueId]['MaxBid'] = maxBidDefault;
    } else {
      keywordData[uniqueId]['MaxBid'] = maxBidLabel;
    }

    // Run the function that defines the higher and lower position target for each KW
    setTopTargets(uniqueId, topTarget);
    setATopTargets(uniqueId, aTopTarget);

    }

  Logger.log(uniqueIds.length + " labelled keywords found");


  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // Run the Function that defines the Bid Increase or Bid Decrease for each KW
  setBidChange();

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // Batch the keyword IDs, as the iterator can't take them all at once
  // Then, update the Keywords CPCMax

  var idBatches = [];
  var batchSize = 5000;
  for (var i=0; i<uniqueIds.length; i += batchSize) {
    idBatches.push(uniqueIds.slice(i,i+batchSize));
  }

  Logger.log("Updating keywords");

  // Update each batch
  for (var i=0; i<idBatches.length; i++) {
    try {
      updateKeywords(idBatches[i]);
    } catch (e) {
      Logger.log("Error updating keywords: " + e);
      Logger.log("Retrying after one minute.");
      Utilities.sleep(60000);
      updateKeywords(idBatches[i]);
    }
  }


  Logger.log("Finished.");



  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // Functions

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // Checks that the Top Target Label has a valid value (number <= 100)
  function integrityCheckTopTarget(target){
    var n = parseFloat(target, 10);
    if(!isNaN(n) && n >= 0 && n <= 100){
      return n;
    }
    else{
      return -1;
    }

  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // Checks that the Maxbid has a valid value (it has to be a number)
  function integrityCheckMaxBid(target){
    var n = parseFloat(target, 10);
    if(!isNaN(n)){
      return n;
    }
    else{
      return -1;
    }

  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//



  // Function that defines the higher and lower target for top Impressions for each KW
  function setTopTargets(uniqueId, target){
    if(target !== -1){
      keywordData[uniqueId]['HigherTopTarget'] = Math.min(target/100+targetTolerance, 1);
      keywordData[uniqueId]['LowerTopTarget'] = Math.max(target/100-targetTolerance, 0);
    }
    else{
      keywordData[uniqueId]['HigherTopTarget'] = -1;
      keywordData[uniqueId]['LowerTopTarget'] = -1;
    }
  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // Function that defines the higher and lower target for absolut top Impressions for each KW
  function setATopTargets(uniqueId, target){
    if(target !== -1){
      keywordData[uniqueId]['HigherATopTarget'] = Math.min(target/100+targetTolerance, 1);
      keywordData[uniqueId]['LowerATopTarget'] = Math.max(target/100-targetTolerance, 0);
    }
    else{
      keywordData[uniqueId]['HigherATopTarget'] = -1;
      keywordData[uniqueId]['LowerATopTarget'] = -1;
    }
  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//



  // Function that calculates the new bid
  function bidChange(uniqueId){

    // Si hay errores previos, retorna un error
    var newBid = -1;
    if(keywordData[uniqueId]['HigherPositionTarget'] === -1){
      return newBid;
    }

    // Simplifica los nombres
    var cpcBid = keywordData[uniqueId]['CpcBid'];
    var minBid = keywordData[uniqueId]['MinBid'];
    var maxBid = keywordData[uniqueId]['MaxBid'];

    // Verifica que Google nos ha devuelto un valor adecuado de "FirstPageCpc"
    if (isNaN(keywordData[uniqueId]['FirstPageCpc'])) {
      Logger.log("Warning: first page CPC estimate is not a number for keyword '" + keywordData[uniqueId]['Criteria'] + "'. This keyword will be skipped");
      return -1;
    }

    // Calcula el bid para alcanzar la primera página
    var firstPageBid = Math.min(keywordData[uniqueId]['FirstPageCpc'], keywordData[uniqueId]['FirstPageMaxBid'], maxBid);

    // Sigue simplificando los nombres
    var aTopImpPer = keywordData[uniqueId]['ATopImpPer'];
    var topImpPer = keywordData[uniqueId]['TopImpPer'];
    var impressions = keywordData[uniqueId]['Impressions'];

    var higherTopTarget = keywordData[uniqueId]['HigherTopTarget'];
    var lowerTopTarget = keywordData[uniqueId]['LowerTopTarget'];
    var higherATopTarget = keywordData[uniqueId]['HigherATopTarget'];
    var lowerATopTarget = keywordData[uniqueId]['LowerATopTarget'];
    var bidIncrease = keywordData[uniqueId]['BidIncrease'];
    var bidDecrease = keywordData[uniqueId]['BidDecrease'];

    Logger.log("Keyword: " + keywordData[uniqueId]['Criteria']);
    Logger.log("Impressions: " + impressions);
    Logger.log("CPCmax: " + cpcBid);
    Logger.log("First Page Bid: " + firstPageBid);

    // NOW, START THE PROCESS TO SELECT THE NEW BID

    // 1. IF WE DO NOT HAVE IMPRESSIONS

    if (impressions == 0) {

      // If we have the option usefirstpagebids... on and we are below first page -> Position yourself in first page
      if (useFirstPageBidsOnKeywordsWithNoImpressions && (cpcBid < firstPageBid)) {
        Logger.log("Zero impressions + Not in First Page Position. We increase CPCmax to reach first page position");
        newBid = Math.min(firstPageBid, maxBid);
      }

      // Otherwise, just stay where you are
      else {
        Logger.log("Zero impressions + In First Page Position. We maintain the CPCmax");
        newBid = cpcBid;
      }
    }


    // 2. IF WE HAVE BOTH LABELS TOP AND ATOP DO NOT CHANGE THE BID AND SEND AN ERROR MESSAGE

    else if (higherTopTarget != -1 && higherATopTarget != -1) {
      Logger.log("The KW: " + keywordData[uniqueId]['Criteria'] +
       " has both TOP and ATOP label. Please review.");
      return -1;
    }

    // 3. IF WE ARE USING TOP, MAKE THE NECESSARY CHANGES

    else if (higherTopTarget != -1) {

      Logger.log("Working with TOP");
      Logger.log("topImpPer: " + topImpPer);
      Logger.log("higherTopTarget: " + higherTopTarget);
      Logger.log("lowerTopTarget: " + lowerTopTarget);

      // If our current percentage is higher than our target, decrease the CPCmax
      if(topImpPer > higherTopTarget) {
        var linearBidModel = Math.min(2*bidDecrease,(2*bidDecrease/higherTopTarget)*(topImpPer-higherTopTarget));
        Logger.log("linearBidModel: " + linearBidModel);
        newBid = Math.max((cpcBid - linearBidModel), minBid);
        // But, if we are already in firstPageBid, do not go below that
        if (cpcBid > firstPageBid) {
          newBid = Math.max(firstPageBid,newBid);
        }
      }
      // If our current percentage is higher than our target, increase the CPCmax
      else if(topImpPer < lowerTopTarget) {
        var linearBidModel = Math.min(2*bidIncrease,((2*bidIncrease/lowerTopTarget)*(topImpPer-lowerTopTarget)));
        Logger.log("linearBidModel: " + linearBidModel);
        newBid = Math.min((cpcBid - linearBidModel),maxBid);
      }
    }


    // 4. IF WE ARE USING ATOP, MAKE THE NECESSARY CHANGES

    else if (higherATopTarget != -1) {

      Logger.log("Working with ATOP");
      Logger.log("AtopImpPer: " + aTopImpPer);
      Logger.log("higherATopTarget: " + higherATopTarget);
      Logger.log("lowerATopTarget: " + lowerATopTarget);

      // If our current percentage is higher than our target, decrease the CPCmax
      if(aTopImpPer > higherATopTarget) {
        var linearBidModel = Math.min(2*bidDecrease,(2*bidDecrease/higherATopTarget)*(aTopImpPer-higherATopTarget));
        Logger.log("linearBidModel: " + linearBidModel);
        newBid = Math.max((cpcBid - linearBidModel), minBid);
        // But, if we are already in firstPageBid, do not go below that
        if (cpcBid > firstPageBid) {
          newBid = Math.max(firstPageBid,newBid);
        }
      }
      // If our current percentage is higher than our target, increase the CPCmax
      else if(aTopImpPer < lowerATopTarget) {
        var linearBidModel = Math.min(2*bidIncrease,((2*bidIncrease/lowerATopTarget)*(aTopImpPer-lowerATopTarget)));
        Logger.log("linearBidModel: " + linearBidModel);
        Logger.log("New CPCmax before maxbid: " + (cpcBid - linearBidModel));
        newBid = Math.min((cpcBid - linearBidModel),maxBid);
      }
    }

    Logger.log("NewBid: " + newBid);

    // If newBid is not a number, send an error message
    if (isNaN(newBid)) {
      Logger.log("Warning: new bid is not a number for keyword '" + keywordData[uniqueId]['Criteria'] + "'. This keyword will be skipped");
      return -1;
    }

    return newBid;

  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // Creates the KW Unique ID
  function keywordUniqueId(keyword){
    var id = keyword.getId();
    var idsIndex = ids.indexOf(id);
    if(idsIndex === ids.lastIndexOf(id)){
      return uniqueIds[idsIndex];
    }
    else{
      var adGroupId = keyword.getAdGroup().getId();
      return adGroupId + idJoin + id;
    }
  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // Function that defines the Bid Increase or Bid Decrease for each KW
  function setBidChange(){
    for(var x in keywordData){
      keywordData[x]['BidIncrease'] = keywordData[x]['CpcBid'] * bidIncreaseProportion/2;
      keywordData[x]['BidDecrease'] = keywordData[x]['CpcBid'] * bidDecreaseProportion/2;
    }
  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // Update the KWs in each one of the batches
  function updateKeywords(idBatch) {
    var keywordIterator = AdWordsApp.keywords()
    .withIds(idBatch.map(function(str){return str.split(idJoin);}))
    .get();
    while(keywordIterator.hasNext()){
      var keyword = keywordIterator.next();

      var uniqueId = keywordUniqueId(keyword);

      var newBid = bidChange(uniqueId);

      if(newBid !== -1){
        keyword.setMaxCpc(newBid);
      }

    }
  }


  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

}
}
