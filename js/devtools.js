// Script executed each time Chrome DevTools opens

// Custom browser compatibility panel.
chrome.devtools.panels.create("Browser Compatibility", "img/toolbarIcon.png", "panel.html",
	function(extensionPanel) {
    	var runOnce = false;
    	extensionPanel.onShown.addListener(function(panelWindow) {
        	if (runOnce) return;
        	runOnce = true;
        	// Do something, eg appending the text "Hello!" to the devtools panel
        	panelWindow.document.body.appendChild(document.createTextNode('Hello!'));
    	});
	}
);


