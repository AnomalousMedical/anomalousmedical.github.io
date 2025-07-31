"use strict";
var runnerElements = document.querySelectorAll('[data-hr-run]');
for (var i = 0; i < runnerElements.length; ++i) {
    var runnerElement = runnerElements[i];
    var runnerAttr = runnerElement.getAttribute('data-hr-run');
    if (runnerAttr) {
        jsns.run(runnerAttr);
    }
}