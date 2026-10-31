if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true}).catch(()=>{});
}
chrome.action.onClicked.addListener(tab=>{
  if(chrome.sidePanel?.open)chrome.sidePanel.open({windowId:tab.windowId}).catch(()=>{});
});
