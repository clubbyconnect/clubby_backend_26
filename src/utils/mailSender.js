const nodemailer = require('nodemailer')

const mailSender = async (email, title, body)=>{
    try {
        console.log("email",email)
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
            from: 'www.Clubby.com - Kaushal Kumar',
            to:`${email}`,
                subject: `${title}`,
                html: `${body}`,
        })

        return info

    } catch (error) {
        
     throw error
    }
}
 module.exports = mailSender;