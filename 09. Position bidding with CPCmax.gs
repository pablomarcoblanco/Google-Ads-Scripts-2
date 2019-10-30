/************************************
* Average Position Bidding Tool
* Version 2.0
* 07/01/2019
* Owned by: Pablo Marco
* Based on the original script by BrainLabs
*
* Goal: This script changes de KW bid based on the
*	target position selected by the user and entered in a label in the KW
*	We have added a second label in the KW to define the CPCMax
*
*

* Version: 2.0
* ChangeLog:
*  	27/12/18: Modify algorithm to work with KW in Mobile
*  	07/01/18: Modify algorithm to have a second level with the CPCMax
*
**************************************/

// Options

var maxBidDefault = 5.00;
// Bids will not be increased past this maximum.
// If there is a label with maxBid, the value of the label will override

var minBid = 0.15;
// Bids will not be decreased below this minimum.

var firstPageMaxBid = 5.00;
// The script avoids reducing a keyword's bid below its first page bid estimate. If you think
// Google's first page bid estimates are too high then use this to overrule them.

var dataFile = "AveragePositionDataSANITASTEST.txt";
// This name is used to create a file in your Google Drive to store today's performance so far,
// for reference the next time the script is run.

var useFirstPageBidsOnKeywordsWithNoImpressions = false;
// If this is true, then if a keyword has had no impressions since the last time the script was run
// its bid will be increased to the first page bid estimate (or the firsPageMaxBid if that is smaller).
// If this is false, keywords with no recent impressions will be left alone.

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

// Advanced Options
var bidIncreaseProportion = 0.2;
var bidDecreaseProportion = 0.2;
var targetPositionTolerance = 0.1;

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

function main() {

  var fieldJoin = ",";
  var lineJoin = "$";
  var idJoin = "#";

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

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // EXTRACT INFORMATION FROM THE LABELS POSITION AND CPCMAX

  // Create vector to Store the Position Labels
  var labelIds = [];

  // Define Label Iterator
  var labelIterator = AdWordsApp.labels()
  .withCondition("KeywordsCount > 0")
  .withCondition("LabelName CONTAINS_IGNORE_CASE 'Position '")
  .get();

  // Store all the KW Labels that have the text "position"
  while (labelIterator.hasNext()) {
    var label = labelIterator.next();
    if (label.getName().substr(0,"position ".length).toLowerCase() == "position ") {
      labelIds.push(label.getId());
    }
  }

  if (labelIds.length == 0) {
    Logger.log("No position labels found.");
    return;
  }
  Logger.log(labelIds.length + " position labels have been found.");

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // Define the Structure of the Object keywordData
  var keywordData = {
    //UniqueId1: {LastHour: {Impressions: , AveragePosition: }, ThisHour: {Impressions: , AveragePosition: },
    //CpcBid: , FirstPageCpc: , MaxBid, MinBid, FirstPageMaxBid, PositionTarget: , CurrentAveragePosition:,
    //Criteria: }
  }

  var ids = [];
  var uniqueIds = [];

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // Create the report that extracts the information of the KWs
  var report = AdWordsApp.report(
    'SELECT Id, Criteria, AdGroupId, AdGroupName, CampaignName, Impressions, AveragePosition, CpcBid, FirstPageCpc, Labels, BiddingStrategyType ' +
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

    // Extract the number in the "Position" label
    for (var i=0; i<labels.length; i++) {
      // If the KW has a "Position" label, then then take the number
      if (labels[i].substr(0,"position ".length) == "position ") {
        var positionTarget = parseFloat(labels[i].substr("position ".length-1).replace(/,/g,"."),10);
      }
      // If the KW has a "Maxbid" label, then take the number
      if (labels[i].substr(0,"maxbid ".length) == "maxbid ") {
        maxBidLabel = parseFloat(labels[i].substr("maxbid ".length-1).replace(/,/g,"."),10);
      }
    }

    // Multiple Checks:
    //  - If there in no positiontarget -> Do no create the data for this KW, jump to the next KW
    //  - If there is positionTarget:
    //    - Check integrity PositionTarget
    //    - If there is maxBid, check it

    if (positionTarget == "") {
      continue;
    }

    // Integrity Check of positionTarget. If there is an error, there will be an error message and there will be no creation of info for this KW
      if (integrityCheckPosition(positionTarget) == -1) {
        Logger.log("Invalid position target '" + positionTarget +  "' for keyword '" + row["Criteria"] + "' in campaign '" + row["CampaignName"] + "'");
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
    keywordData[uniqueId]['ThisHour'] = {};

    keywordData[uniqueId]['ThisHour']['Impressions'] = parseFloat(row['Impressions'].replace(/,/g,""),10);
    keywordData[uniqueId]['ThisHour']['AveragePosition'] = parseFloat(row['AveragePosition'].replace(/,/g,""),10);

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
    setPositionTargets(uniqueId, positionTarget);

    }

  Logger.log(uniqueIds.length + " labelled keywords found");

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // Run the Function that defines the Bid Increase or Bid Decrease for each KW
  setBidChange();

  // Run the Function that adds the information in minBid and maxBid to each KW in the object
  //setMinMaxBids();

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // Calculate Current Hour
  var currentHour = parseInt(Utilities.formatDate(new Date(), AdWordsApp.currentAccount().getTimeZone(), "HH"), 10);

  // Extract the information from the Data File and add it to the Object
  if (currentHour != 0) {
    var data = file.getBlob().getDataAsString();
    var data = data.split(lineJoin);
    for(var i = 0; i < data.length; i++){
      data[i] = data[i].split(fieldJoin);
      var uniqueId = data[i][0];
      if(keywordData.hasOwnProperty(uniqueId)){
        keywordData[uniqueId]['LastHour'] = {};
        keywordData[uniqueId]['LastHour']['Impressions'] = parseFloat(data[i][1],10);
        keywordData[uniqueId]['LastHour']['AveragePosition'] = parseFloat(data[i][2],10);
      }
    }
  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // Run the Function to define the Current Average Position.
  findCurrentAveragePosition();

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  //Batch the keyword IDs, as the iterator can't take them all at once
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

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  Logger.log("Writing file.");
  var content = resultsString();
  file.setContent(content);

  Logger.log("Finished.");

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // Functions

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // Checks that the Position Label has a valid value (number > 1)
  function integrityCheckPosition(target){
    var n = parseFloat(target, 10);
    if(!isNaN(n) && n >= 1){
      return n;
    }
    else{
      return -1;
    }

  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // Checks that the Maxbid has a valid value (number > 1)
  function integrityCheckMaxBid(target){
    var n = parseFloat(target, 10);
    Logger.log("El numero n es: " + n);
    if(!isNaN(n)){
      return n;
    }
    else{
      return -1;
    }

  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//



  // Function that defines the higher and lower position target for each KW
  function setPositionTargets(uniqueId, target){
    if(target !== -1){
      keywordData[uniqueId]['HigherPositionTarget'] = Math.max(target-targetPositionTolerance, 1);
      keywordData[uniqueId]['LowerPositionTarget'] = target+targetPositionTolerance;
    }
    else{
      keywordData[uniqueId]['HigherPositionTarget'] = -1;
      keywordData[uniqueId]['LowerPositionTarget'] = -1;
    }
  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // Function that calculates the new bid
  function bidChange(uniqueId){

    var newBid = -1;
    if(keywordData[uniqueId]['HigherPositionTarget'] === -1){
      return newBid;
    }

    var cpcBid = keywordData[uniqueId]['CpcBid'];
    var minBid = keywordData[uniqueId]['MinBid'];
    var maxBid = keywordData[uniqueId]['MaxBid'];

    if (isNaN(keywordData[uniqueId]['FirstPageCpc'])) {
      Logger.log("Warning: first page CPC estimate is not a number for keyword '" + keywordData[uniqueId]['Criteria'] + "'. This keyword will be skipped");
      return -1;
    }

    var firstPageBid = Math.min(keywordData[uniqueId]['FirstPageCpc'], keywordData[uniqueId]['FirstPageMaxBid'], maxBid);

    var currentPosition = keywordData[uniqueId]['CurrentAveragePosition'];
    var higherPositionTarget = keywordData[uniqueId]['HigherPositionTarget'];
    var lowerPositionTarget = keywordData[uniqueId]['LowerPositionTarget'];

    var bidIncrease = keywordData[uniqueId]['BidIncrease'];
    var bidDecrease = keywordData[uniqueId]['BidDecrease'];

    if((currentPosition > lowerPositionTarget) && (currentPosition !== 0)){
      var linearBidModel = Math.min(2*bidIncrease,(2*bidIncrease/lowerPositionTarget)*(currentPosition-lowerPositionTarget));
      var newBid = Math.min((cpcBid + linearBidModel), maxBid);
    }
    if((currentPosition < higherPositionTarget) && (currentPosition !== 0)) {
      var linearBidModel = Math.min(2*bidDecrease,((-4)*bidDecrease/higherPositionTarget)*(currentPosition-higherPositionTarget));
      var newBid = Math.max((cpcBid-linearBidModel),minBid);
      if (cpcBid > firstPageBid) {
        var newBid = Math.max(firstPageBid,newBid);
      }
    }
    if((currentPosition === 0) && useFirstPageBidsOnKeywordsWithNoImpressions && (cpcBid < firstPageBid)){
      var newBid = firstPageBid;
    }

    if (isNaN(newBid)) {
      Logger.log("Warning: new bid is not a number for keyword '" + keywordData[uniqueId]['Criteria'] + "'. This keyword will be skipped");
      return -1;
    }

    return newBid;

  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // Function to define the Current Average Position. If this is the first data of the KW, stays in the same
  // Otherwise, go to "CalculateAveragePosition"
  function findCurrentAveragePosition(){
    for(var x in keywordData){
      if(keywordData[x].hasOwnProperty('LastHour')){
        keywordData[x]['CurrentAveragePosition'] = calculateAveragePosition(keywordData[x]);
      } else {
        keywordData[x]['CurrentAveragePosition'] = keywordData[x]['ThisHour']['AveragePosition'];
      }
    }
  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  // Function that calculates the new Average Position
  // If No new Impressions in the last hour, do not change
  // If there are new impressions, calculate an average for the last hour based in the data of the last hour
  // The idea (I think) is that the acerage position from GAds is the one of the last impression, but we
  // need the average of the last hour

  function calculateAveragePosition(keywordDataElement){
    var lastHourImpressions = keywordDataElement['LastHour']['Impressions'];
    var lastHourAveragePosition = keywordDataElement['LastHour']['AveragePosition'];

    var thisHourImpressions = keywordDataElement['ThisHour']['Impressions'];
    var thisHourAveragePosition = keywordDataElement['ThisHour']['AveragePosition'];

    if(thisHourImpressions == lastHourImpressions){
      return 0;
    }
    else{
      var currentPosition = (thisHourImpressions*thisHourAveragePosition-lastHourImpressions*lastHourAveragePosition)/(thisHourImpressions-lastHourImpressions);
      if (currentPosition < 1) {
        return 0;
      } else {
        return currentPosition;
      }
    }
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

  /*
  // Function that adds the information in minBid and maxBid to each KW in the object
  function setMinMaxBids(){
    for(var x in keywordData){
      keywordData[x]['MinBid'] = minBid;
      keywordData[x]['MaxBid'] = maxBid;
      keywordData[x]['FirstPageMaxBid'] = firstPageMaxBid;
    }
  }
 */
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

  // Creates the string with results that we will store in a file to use it as "Last Hour" in the
  // next running of the Script

  function resultsString(){

    var results = [];
    for(var uniqueId in keywordData){
      var resultsRow = [uniqueId, keywordData[uniqueId]['ThisHour']['Impressions'], keywordData[uniqueId]['ThisHour']['AveragePosition']];
      results.push(resultsRow.join(fieldJoin));
    }

    return results.join(lineJoin);
  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

}
