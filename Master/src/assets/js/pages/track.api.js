// src/assets/js/pages/track.api.js
(function () {
  var API_URL = "http://localhost:3000"; // ajuste se preciso

  function j(r){ return r.json(); }

  window.TrackAPI = {
    listSaidas: function(params){
      params = params || {};
      var q = new URLSearchParams(params).toString();
      return fetch(API_URL + "/api/saidas?" + q).then(j);
    },
    updateSaida: function(id, payload){
      return fetch(API_URL + "/api/saidas/" + id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).then(j);
    },
    deleteSaida: function(id){
      return fetch(API_URL + "/api/saidas/" + id, { method: "DELETE" }).then(j);
    },
    bulkDelete: function(ids){
      return fetch(API_URL + "/api/saidas/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ids })
      }).then(j);
    },
    getConfig: function(){
      return fetch(API_URL + "/api/config").then(j);
    }
  };

  
})();
