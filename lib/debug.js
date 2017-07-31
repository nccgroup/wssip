try {
  module.exports = require('debug');
} catch(e) {
  module.exports = function(){ return function(){} }
}
