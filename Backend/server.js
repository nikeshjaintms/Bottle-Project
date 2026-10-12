const app = require("./src/app");
require("dotenv").config();
const connectDB = require("./src/config/db");
const seedRBAC = require("./src/seeders/rbac.seeder");


connectDB().then(() => {
    seedRBAC();
});


app.listen(5000, () => {
    console.log("server is running on port 5000");
})
