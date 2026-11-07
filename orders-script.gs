// ===== SETTINGS: fill in what you want to use =====
var EMAIL = "your-email@gmail.com";   // leave "" to turn email off
var TG_TOKEN = "";                    // Telegram bot token, leave "" to turn off
var TG_CHAT = "";                     // Telegram chat ID
// ==================================================

function doPost(e) {
  var d = JSON.parse(e.postData.contents);
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName("Orders") || ss.insertSheet("Orders");
  if (sh.getLastRow() === 0) {
    sh.appendRow(["Order No", "Time", "Name", "Contact", "Items", "Total", "Payment", "Account details", "Status"]);
  }
  sh.appendRow([d.orderId, d.time, d.name, d.contact, d.items, d.total, d.method, d.details, d.status]);
  notify(d);
  return ContentService.createTextOutput("ok");
}

function notify(d) {
  var text = "NEW ORDER " + d.orderId + "\n" +
    "Total: " + d.total + " (" + d.method + ")\n" +
    "Items: " + d.items + "\n" +
    "Account: " + d.details + "\n" +
    "Customer: " + d.name + " / " + d.contact;
  try {
    if (EMAIL) MailApp.sendEmail(EMAIL, "New order " + d.orderId + " - " + d.total, text);
  } catch (err) {}
  try {
    if (TG_TOKEN && TG_CHAT) {
      UrlFetchApp.fetch("https://api.telegram.org/bot" + TG_TOKEN + "/sendMessage", {
        method: "post",
        payload: { chat_id: TG_CHAT, text: text }
      });
    }
  } catch (err) {}
}
