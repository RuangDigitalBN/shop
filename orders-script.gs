function doPost(e) {
  var d = JSON.parse(e.postData.contents);
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName("Orders") || ss.insertSheet("Orders");
  if (sh.getLastRow() === 0) {
    sh.appendRow(["Order No", "Time", "Name", "Contact", "Items", "Total", "Payment", "Account details", "Status"]);
  }
  sh.appendRow([d.orderId, d.time, d.name, d.contact, d.items, d.total, d.method, d.details, d.status]);
  return ContentService.createTextOutput("ok");
}
