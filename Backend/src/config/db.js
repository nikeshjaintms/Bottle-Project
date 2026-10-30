const mongoose = require("mongoose");

// Global query counter for monitoring
global._mongoQueryCount = 0;

const connectDB = async () => {
    try{
        await mongoose.connect(process.env.MONGO_URI, {
            // monitorCommands: true,  // Disabled during development - uncomment to enable query counting
        });
        
        // Setup command monitoring to track query count (disabled)
        // mongoose.connection.getClient().on('commandStarted', (event) => {
        //     global._mongoQueryCount++;
        // });
        
        console.log("Connected to database");
    }catch(error){
        console.log("DB connection Error:",error.message);
        process.exit(1);
    }
}

module.exports=connectDB;