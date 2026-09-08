/**
 * Success Email Template
 * @param {string} status - HTTP status or descriptive status
 * @param {object|string} details - Detailed response data
 */
function SuccessTemplate(status, details) {
  const detailsStr =
    typeof details === "object" ? JSON.stringify(details, null, 2) : details;
  const timestamp = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  });

  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Process Completion Success</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f4f7f9;
            margin: 0;
            padding: 0;
            -webkit-font-smoothing: antialiased;
        }
        .wrapper {
            width: 100%;
            table-layout: fixed;
            background-color: #f4f7f9;
            padding-bottom: 40px;
        }
        .main {
            background-color: #ffffff;
            margin: 0 auto;
            width: 100%;
            max-width: 600px;
            border-spacing: 0;
            color: #4a4a4a;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 10px rgba(0,0,0,0.05);
            margin-top: 40px;
        }
        .header {
            background: linear-gradient(135deg, #004a99 0%, #0072bc 100%);
            padding: 40px 20px;
            text-align: center;
        }
        .header h1 {
            color: #ffffff;
            font-size: 24px;
            margin: 0;
            letter-spacing: 1px;
            text-transform: uppercase;
        }
        .content {
            padding: 40px 30px;
        }
        .status-badge {
            display: inline-block;
            background-color: #e6fcf5;
            color: #0ca678;
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: bold;
            font-size: 14px;
            margin-bottom: 20px;
        }
        .content h2 {
            color: #2d3436;
            font-size: 20px;
            margin-top: 0;
        }
        .content p {
            font-size: 16px;
            line-height: 1.6;
            color: #636e72;
        }
        .details-box {
            background-color: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            padding: 20px;
            margin-top: 30px;
        }
        .details-title {
            font-size: 13px;
            font-weight: bold;
            color: #b2bec3;
            text-transform: uppercase;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
        }
        pre {
            white-space: pre-wrap;
            word-break: break-all;
            font-family: 'Courier New', Courier, monospace;
            font-size: 14px;
            color: #2d3436;
            margin: 0;
        }
        .footer {
            padding: 30px;
            text-align: center;
            font-size: 12px;
            color: #b2bec3;
        }
        .footer hr {
            border: 0;
            border-top: 1px solid #eee;
            margin-bottom: 20px;
        }
        .accent {
            color: #0072bc;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="wrapper">
        <table class="main">
            <tr>
                <td class="header">
                    <h1>Process Notification</h1>
                </td>
            </tr>
            <tr>
                <td class="content">
                    <div class="status-badge">✓ SUCCESSFUL</div>
                    <h2>Scheme Automation Process Completed</h2>
                    <p>Greetings,</p>
                    <p>The automation system has successfully processed the Scheme Automation request. All operations were completed without issues.</p>
                    
                    <div class="details-box">
                        <div class="details-title">Completion Summary</div>
                        <p style="margin-bottom: 10px;"><span class="accent">Status:</span> ${status}</p>
                        <p style="margin-bottom: 10px;"><span class="accent">Timestamp:</span> ${timestamp}</p>
                        <div class="details-title" style="margin-top: 20px;">Technical Details</div>
                        <pre>${detailsStr}</pre>
                    </div>
                </td>
            </tr>
            <tr>
                <td class="footer">
                    <hr>
                    <p>This is an automated message from the Scheme Automation System.</p>
                    <p>&copy; 2026 Scheme Automation. All rights reserved.</p>
                </td>
            </tr>
        </table>
    </div>
</body>
</html>
  `;
}

module.exports = SuccessTemplate;
