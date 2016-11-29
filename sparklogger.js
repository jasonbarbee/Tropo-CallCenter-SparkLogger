// Author: Jason Barbee
// License: GPLv3
// Github Repo https://github.com/jasonbarbee/Tropo-CallCenter-SparkLogger

// Requirements
// you must call this via REST API
// example URL assuming you set the Bearer header.
// call https://api.tropo.com/1.0/sessions?action=create&token=yourSuperCoolTropoToken&dialnumber=1231231234&dial247=true
// set a dialnumber = do not include extra quotes.
// set dial247 true or false. Default hours are 8am to 5pm if false.

// Global Setting Variables.
// CUSTOMIZE this for your environment
// Maximum hold time variable. Example of 15 minutes. 1 second below to trigger on 900.
var maxtimer = 899;
// We are in CST -6
var timezoneoffset = -6;
//  Caller ID is your TROPO number in your dashbard. This sets the caller id.
var callerid = '11231231234';
// Create an integration ID or use your own Auth Token here.
var SparkToken = "Your Spark Bearer token or Integration token";
var SparkRoomID = "Spark Room ID";
// Customize your Announcement
var askMessage = "This is a test call from your IT Department. Press 1 to accept the call.";
// Default hours are 8am to 5pm if dial247 is not true
var businessHourOpen = 8;
var businessHourClose = 17;

//Override any of those above variables via the API HTTP call if you want.

// if REST doesn't specific dial247 then set it to false.
if(!dial247) {
    dial247 = false;
}

// Some Date and timezone settings.
var today = new Date();
var localtime = new Date(today - (timezoneoffset*60*60));
localtime.setHours(today.getHours() + timezoneoffset);
//var hour = localtime.getHours();
//var min = localtime.getMinutes();

// Spark Logger copied from Cisco Tropo Spark Public Examples. Thanks Cisco!
function SparkLog(appName, incomingIntegrationID) {

	if (!appName) {
		log("SPARK_LOG : bad configuration, no application name, exiting...");
		throw createError("SparkLibrary configuration error: no application name specified");
	}
        this.tropoApp = appName;

	if (!incomingIntegrationID) {
		log("SPARK_LOG : bad configuration, no Spark incoming integration URI, exiting...");
		throw createError("SparkLibrary configuration error: no Spark incoming integration URI specified");
	}
        this.sparkIntegration = incomingIntegrationID;

	log("SPARK_LOG: all set for application:" + this.tropoApp + ", posting to integrationURI: " + this.sparkIntegration);
}

// This function sends the log entry to the registered Spark Room
// Invoke this function from the Tropo token-url with the "sparkIntegration" parameter set to the incoming Webhook ID you'll have prepared
// Returns true if the log entry was acknowledge by Spark (ie, got a 2xx HTTP status code)
SparkLog.prototype.log = function(newLogEntry) {

    // Robustify
    if (!newLogEntry) {
    	newLogEntry = "";
    }

    var result;
    try {
        // Open Connection
        var url = "https://api.ciscospark.com/v1/messages/";
        connection = new java.net.URL(url).openConnection();

        // Set timeout to 10s
        connection.setReadTimeout(10000);
        connection.setConnectTimeout(10000);

        // Method == POST
        connection.setRequestMethod("POST");
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setRequestProperty ("Authorization", "Bearer " + SparkToken);

        // TODO : check if this cannot be removed
        connection.setRequestProperty("Content-Length", newLogEntry.length);
        connection.setUseCaches (false);
        connection.setDoInput(true);
        connection.setDoOutput(true);

        //Send Post Data
        bodyWriter = new java.io.DataOutputStream(connection.getOutputStream());
        log("SPARK_LOG: posting: " + newLogEntry + " to: " + url);
        contents = '{ "roomId":"' + SparkRoomID + '","text": "' + this.tropoApp + ': ' + newLogEntry + '" }';
        log("SPARK_LOG: posting: " + contents);
        bodyWriter.writeBytes(contents);
        bodyWriter.flush ();
        bodyWriter.close ();

        result = connection.getResponseCode();
        log("SPARK_LOG: read response code: " + result);

	if(result < 200 || result > 299) {
	        log("SPARK_LOG: could not log to Spark, message format not supported");
	        return false;
	 }
    }
    catch(e) {
        log("SPARK_LOG: could not log to Spark, socket Exception or Server Timeout");
        return false;
    }

    log("SPARK_LOG: log successfully sent to Spark, status code: " + result);
    return true; // success
};

// This will look like this
// INFO: 251XXXXXXX: TEXT
var SparkInfo = new SparkLog("INFO:" + dialnumber + " - " + localtime, SparkRoomID);


function info(logEntry) {
  log("INFO: " + logEntry);
  SparkInfo.log(logEntry);
}

// Looping and temporary state variables. No need to change.
var timer = 0;
var confirmed = false;
var terminated = false;

// this variable comes in from REST call, to control if the request should be dialed all hours of teh day.
if(dial247 == "true")
{
// Start of the call
info("Start: Initiating test call. ");
call(dialnumber, {
   timeout:12,
   channel:"VOICE",
   callerID:callerid,
      onAnswer: function() {
      info("Info - Call answered.");
      while(!terminated && currentCall.isActive()) {
          loop();
      }
      // Start the asking loop.
   },
   onTimeout: function() {
       info("Failure: Call timeout never connected.");
       end();
   },
   onCallFailure: function() {
      info("Failure: Call failed could not dial");
      end();
   }
});
}
else
{
    //only allow afterhours for some numbers
    // this customer wanted default calls to only run from 8am to 4pm.
    if(hour > businessHourClose || hour < businessHourOpen )
    {
    // Start of the call
    info("Initiating test call to " + dialnumber);
    call(dialnumber, {
       timeout:12,
       channel:"VOICE",
       callerID:callerid,
          onAnswer: function() {
          info("Info - Call answered");
          while(!terminated && currentCall.isActive()) {
          loop();
      }
       },
       onTimeout: function() {
           info("Failure: Call timeout never connected.");
           end();
       },
       onCallFailure: function() {
          info("Failure: Call failed could not dial.");
          end();
       }
    });
    }
}

function abandon() {
    // report back abandon info to Spark Room.
    info("Failure: Call Abandoned. Held for " + timer + " seconds. "   + "Start time was " + localtime);
    hangup();
    // If you want you could add some other SMS Alerting here.
    end();
}

function ask_user() {
    ask(AskMessage, {
        mode: "dtmf",
        choices: "1",
        timeout: 10.0,
        attempts: 1,
        onBadChoice: function(event) {
            say("I’m sorry,  I didn’t understand that. Please try again.");
        },
        onChoice: function(event) {
                if (event.value == "1") {
                    say("Thanks for confirming you received the call.");
                    info("Success: Agent confirmed the call.");
                    confirmed=true;
                    terminated=true;
            }
        }
      });
    }

function loop() {
        // No fun to have Tropo Zombie calls accumulating usage and spamming the logs.
        // If we can't end the call within the max call time, hang up.
        // 900 seconds = 15 minutes
        // Hangup after 15 minutes.
        //info("looping. timer:" + timer);
        if (timer > maxtimer)
        {
            info("Failure: disconnecting after 15 minutes hold time.");
            terminated=true;
            end();
        }
         if (currentCall.isActive())
        {
            // The ask step above with delay takes about 15 seconds - accounts for the welcome message/timeout.
            timer = timer + 15;
            ask_user();
        }
        else
        {
            if (confirmed) {
                terminated=true;
                end();
            }
            else
            {
                terminated=true;
                abandon();
            }
        }
}


function end() {
    hangup;
    terminated=true;
}
