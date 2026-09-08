const nodemailer = require("nodemailer");
const SuccessTemplate = require("./template/Success");
const FailedTemplate = require("./template/Failed");
const TriggeredTemplate = require("./template/Triggered");

/**
 * Sends an email notification regarding the scheme automation process status.
 * @param {string} status - HTTP status or descriptive status
 * @param {object|string} details - Detailed response data or error message
 */
async function sendBillingNotification(status, details) {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // Use STARTTLS
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_APP_PASS,
    },
  });

  // Handle multiple recipients from environment variable
  const recipients = process.env.EMAIL_TO || "";

  // Nodemailer handles comma-separated strings directly, but we ensure it's clean
  const cleanRecipients = recipients
    .split(",")
    .map((r) => r.trim())
    .filter((r) => r)
    .join(", ");

  const isSuccess = status === 200 || status === "200" || status === "Success";
  const isTriggered = status === "Triggered";

  const htmlContent = isTriggered
    ? TriggeredTemplate(details)
    : isSuccess
    ? SuccessTemplate(status, details)
    : FailedTemplate(status, details);

  const mailOptions = {
    from: `"Scheme Automation" <${process.env.EMAIL_USERNAME}>`,
    to: cleanRecipients,
    subject: `[${isTriggered ? "TRIGGERED" : isSuccess ? "SUCCESS" : "FAILURE"}] Scheme Automation - Status: ${status}`,
    text: `Status: ${status}\n\nDetails:\n${typeof details === "object" ? JSON.stringify(details, null, 2) : details}`,
    html: htmlContent,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("[EmailSuccess] Message sent to: %s", cleanRecipients);
    console.log("[EmailSuccess] Message ID: %s", info.messageId);
    return info;
  } catch (error) {
    console.error(
      "[EmailError] Failed to send email to %s:",
      cleanRecipients,
      error.message,
    );
    throw error;
  }
}

module.exports = { sendBillingNotification };
