/************************************
* Alerts follow up in the accounts
* Version 1.0
* 5/1/2019
* Written By: Pablo Marco
*
* Goal: Starts and stops AdGroups
* every hour so we can perform A/B Tests
*
* Version: 1.0
* ChangeLog:
*  	No changes
*
**************************************/


//////////////////////////////////////////////////////////////////////////////
// Options


// Labels used for the AdGroups being tested
  var adGroupLabelA = "Control";
  var adGroupLabelB = "Experiment";


// HERE STARTS THE CODE
  //////////////////////////////////////////////////////////////////////////////

function main() {

  // Prepare all the calculations related to date and time

  var days = [31,28,31,30,31,30,31,31,30,31,30,31];

  var date = new Date();
  var timeZone = AdWordsApp.currentAccount().getTimeZone();
  var month = parseInt(Utilities.formatDate(date, timeZone, "MM"), 10) - 1;
  var dayOfMonth = parseInt(Utilities.formatDate(date, timeZone, "dd"), 10);
  var hour = parseInt(Utilities.formatDate(date, timeZone, "HH"), 10);
  var year = parseInt(Utilities.formatDate(date, timeZone, "YYYY"), 10);

  if(leapYear(year)) days[1] = 29;

  var totalDays = 0;

  for(var i = 0; i < month; i++){
    totalDays += days[i];
  }

  totalDays += dayOfMonth;

  Logger.log("Day of year: " + totalDays);

  Logger.log("hour: " + hour);

  enable_pause(totalDays, hour);

}

// HERE ENDS THE MAIN FUNCTION
//////////////////////////////////////////////////////////////////////////////


// AUXILIARY FUNCTIONS
//////////////////////////////////////////////////////////////////////////////


/**
* Returns true if leap year, false otherwise
*
* @param int year the object housing the details
* @param boole is current year a leap year
*/

function leapYear(year){

  return ((year % 4 == 0) && (year % 100 != 0)) || (year % 400 == 0);
}


/**
* Will pause or enable campaigns based on labels
*
* @param object campaignExperiment the object housing the details
* @param int totalDays the number of days since Jan 1st
* @param int hour the hour of the day
*/

function enable_pause(totalDays, hour){

  var labelA = adGroupLabelA;
  var labelB = adGroupLabelB;

  if(totalDays % 2 === 0){
    if(hour % 2 === 0){
      EnableCampaigns(labelA)
      PauseCampaigns(labelB)
    }
    else{
      EnableCampaigns(labelB)
      PauseCampaigns(labelA)
    }
  }
  else{
    if(hour % 2 === 0){
      EnableCampaigns(labelB)
      PauseCampaigns(labelA)
    }
    else{
      EnableCampaigns(labelA)
      PauseCampaigns(labelB)
    }
  }
}

/**
* Produces string which can be passed to eval() to create an iterator object.
* Allows dynamic creation of iterators for different types of object.
*
* @param String campaignType the type of iterator to produce e.g "campaigns" or "shoppingCampaigns"
* @param String label for filtering
* @return String Correctly parsed AdWords iterator object
*/
function objectIterator(label){

  var iterator = "AdWordsApp.adGroups()";
  iterator += ".withCondition('LabelNames CONTAINS_ANY " + '["' + label + '"]' + "')";
  iterator += ".get();";

  return iterator;

}

/**
* Pause all campaigns of specific type which have a specific label
*
* @param String campaignType the type of campaign to change
* @param String label for filtering
*/
function PauseCampaigns(label){
  var iterator = eval(objectIterator(label));
  if (!iterator.hasNext()) {
    Logger.log("Warning: no AdGroup found with the label '" + label + "'. No adGroups paused.");
  }
  while(iterator.hasNext()){
    var object = iterator.next();
    object.pause();
  }
}

/**
* Enable all campaigns of specific type which have a specific label
*
* @param String campaignType the type of campaign to change
* @param String label for filtering
*/
function EnableCampaigns(label){
  var iterator = eval(objectIterator(label));
  if (!iterator.hasNext()) {
    Logger.log("Warning: no AdGroup found with the label '" + label + "'. No adGroups enabled.");
  }
  while(iterator.hasNext()){
    var object = iterator.next();
    object.enable();
  }
}
