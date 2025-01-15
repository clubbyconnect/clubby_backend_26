const mongoose = require("mongoose");
const dotenv = require("dotenv");
const User = require("./src/models/user"); // Adjust the path if needed

dotenv.config({ path: "./.env" });

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

async function updateUsers() {
    try {
        const result = await User.updateMany({}, { $set: { favourites: [] } });
        console.log(`Updated ${result.modifiedCount} users with favourites field.`);
    } catch (error) {
        console.error("Error updating users:", error);
    } finally {
        mongoose.disconnect();
    }
}

updateUsers();
