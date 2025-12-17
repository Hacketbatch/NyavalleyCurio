// testEmail.js
const nodemailer = require("nodemailer");
require("dotenv").config();

async function sendTestEmail() {
  try {
    // Create a transporter using Gmail SMTP
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // Send the email
    const info = await transporter.sendMail({
      from: `"Nyavalley E-commerce" <${process.env.EMAIL_USER}>`,
      to: "your-other-email@example.com", // use a real address you can check
      subject: "✅ Test Email from Nodemailer",
      text: "If you’re seeing this, your Gmail App Password works!",
      html: "<b>Congratulations!</b><br>Your Gmail App Password works perfectly 🎉",
    });

    console.log("✅ Email sent successfully:", info.response);
  } catch (error) {
    console.error("❌ Error sending email:", error.message);
  }
}

sendTestEmail();
