const nodemailer = require('nodemailer')

const mailSender = async (email, title, body)=>{
    try {
        //to send email -> Transporter
        let transporter = nodemailer.createTransport({
            host:process.env.MAIL_HOST,  
                auth:{
                    user: process.env.MAIL_USER,  
                    pass: process.env.MAIL_PASS,  
                }
        }) 

        //now Send e-mails to users
        let info = await transporter.sendMail({
            from: 'www.sandeepdev.me - Sandeep Singh',
            to:`${email}`,
                subject: `${title}`,
                html: `${body}`,
        })

        console.log("Info is here: ",info)
        return info

    } catch (error) {
        
     throw error
    }
}

module.exports = mailSender;

//MAIL_HOST=smtp.gmail.com
//MAIL_USER=amjglobaliasoft@gmail.com
//MAIL_PASS=sass jpno kdvg ffpc