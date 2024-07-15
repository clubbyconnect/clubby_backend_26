const mongoose= require("mongoose")
const mailSender = require('../utils/mailSender.js')

const OTPSchema = new mongoose.Schema({
    email: {
		type: String,
	},
    mobileNumber: {
		type: String,
	},
	otp: {
		type: String,
		required: true,
	},
	createdAt: {
		type: Date,
		default: Date.now,
		expires: 60 * 5, 
	},
})

async function sendVerificationEmail(email, otp) {
	try {
        console.log("emailemailemail",email , otp );
		const mailResponse = await mailSender(
			email,
			"Verification Email",
			`<h1>Please confirm your OTP </h1>
             <p> here is your OTP code:-> ${otp} </p>
            `
		);
	} catch (error) {
        throw error
	}
}

OTPSchema.pre("save", async function (next) {
	if (this.isNew) {
		await sendVerificationEmail(this.email, this.otp);
	}
	next();
});

const OTP = mongoose.model("OTP", OTPSchema);

module.exports = OTP;