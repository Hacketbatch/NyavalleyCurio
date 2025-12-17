const nodemailer = require("nodemailer");
require("dotenv").config();

const transporter = nodemailer.createTransport({
  service: "gmail", // or use "smtp.mailtrap.io" for testing
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendContactEmail(name, email, message) {
  const mailOptions = {
    from: `"Nyavalley E-commerce" <${process.env.EMAIL_USER}>`,
    to: process.env.EMAIL_USER, // send to your admin inbox
    subject: `New Contact Message from ${name}`,
    text: `
      You received a new contact message:

      Name: ${name}
      Email: ${email}
      Message:
      ${message}
    `,
  };

  await transporter.sendMail(mailOptions);
}

module.exports = sendContactEmail;
