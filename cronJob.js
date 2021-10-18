const nodeCron = require("node-cron");
const zoom = require("./main");

let arr = [];

let job = nodeCron.schedule("* * * * *", start);




function start(){
    console.log("starting up...");
    zoom.run().then(function(){
        arr.push('done');
        console.log("Length: ", arr.length);
        if(arr.length == 2){
            job.stop();
        }
    });
    
}



