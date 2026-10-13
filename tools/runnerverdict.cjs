// Authored HTML fixture summaries. Keep the line grammar strict: arbitrary success suffixes are not completion.
// Combat/Nerf fixtures add a check count; combatworld also names its standalone Three/no-WebGL scope.
const SUCCESS = /^ALL PASS(?: [0-9]+ checks(?:; actual Three, no WebGL)?)?[\t \r]*$/m;
const COMPLETE = /^(?:(?:ALL PASS|SOME FAILED)|(?:ALL PASS|FAIL) [0-9]+ checks(?:; actual Three, no WebGL)?)[\t \r]*$/m;
module.exports = { isComplete: text => COMPLETE.test(text), hasSuccess: text => SUCCESS.test(text) };
