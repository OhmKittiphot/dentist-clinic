module.exports = function layoutSupport(req, res, next){
  res.locals.layout = function(name){
    const original = res.render;
    res.render = function(view, options={}, callback){
      original.call(res, view, options, function(err, html){
        if (err) return callback ? callback(err) : next(err);
        res.app.render(name, { ...options, body: html }, callback || function(e, out){ if(e) next(e); else res.send(out); });
      });
    };
  };
  next();
};