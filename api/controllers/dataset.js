'use strict';

//contrib
const express = require('express');
const router = express.Router();
const winston = require('winston');
const jwt = require('express-jwt');
const jsonwebtoken = require('jsonwebtoken');
const async = require('async');
const request = require('request');
const meter = require('stream-meter');
const mongoose = require('mongoose');

//mine
const config = require('../config');
const logger = new winston.Logger(config.logger.winston);
const db = require('../models');
const common = require('../common');

function canedit(user, rec, canwrite_project_ids) {
    if(!rec.user_id) return false;  //TODO - can this really happen?
    
    if(user) {
        //if(user.scopes.warehouse && ~user.scopes.warehouse.indexOf('admin')) return true;
        if(rec.user_id == user.sub.toString()) return true;
        let canwrite_project_ids_str = canwrite_project_ids.map(id=>id.toString());
        let project_id = rec.project._id || rec.project; //could be populated.. 
        if(~canwrite_project_ids_str.indexOf(project_id.toString())) return true;
    }
    return false;
}

function construct_dataset_query(query, canread_project_ids) {
    var ands = [];

    //just pass find query (safe?)
    if(query.find) ands.push(JSON.parse(query.find));

    //handle datatype_tags
    if(query.datatype_tags) {
        query.datatype_tags.forEach(tag=>{ 
            if(tag[0] == "!") {
                ands.push({datatype_tags: {$ne: tag.substring(1)}});
            } else {
                ands.push({datatype_tags: tag});
            }
        });
    }
    
    //put things together
    ands.push({$or: [
        {project: {$in: canread_project_ids}},
        {publications: {$gt:[]}}, //allow access for published dataset
    ]});
    return { $and: ands };
}

/**
 * @apiGroup Dataset
 * @api {get} /dataset          Query Datasets
 * @apiDescription              Returns all dataset entries accessible to the user
 *
 * @apiParam {Object} [find]    Optional Mongo query to perform (you need to JSON.stringify)
 * @apiParam {Object} [sort]    Mongo sort object - defaults to _id. Enter in string format like "-name%20desc"
 * @apiParam {String} [select]  Fields to load - multiple fields can be entered with %20 as delimiter (default all)
 * @apiParam {String[]} [datatype_tags]  
 *                              List of datatype tags to filter (you can use exclusion tags also)
 * @apiParam {Number} [limit]   Maximum number of records to return - defaults to 100
 * @apiParam {Number} [skip]    Record offset for pagination (default to 0)
 * @apiParam {String} [populate] Fields to populate - default to "project datatype"
 * 
 * @apiHeader {String} authorization A valid JWT token "Bearer: xxxxx"
 *
 * @apiSuccess {Object}         List of datasets (maybe limited / skipped) and total count
 */
router.get('/', jwt({secret: config.express.pubkey, credentialsRequired: false}), (req, res, next)=>{
    var skip = req.query.skip||0;
    let limit = req.query.limit||100; //this means if user set it to "0", no limit
    common.getprojects(req.user, (err, canread_project_ids, canwrite_project_ids)=>{
        if(err) return next(err);
        let query = construct_dataset_query(req.query, canread_project_ids);
        db.Datasets.find(query)
        .populate(req.query.populate || '') //all by default
        .select(req.query.select)
        .limit(+limit)
        .skip(+skip)
        .sort(req.query.sort || '_id')
		.lean()
		.exec((err, datasets)=>{
            if(err) return next(err);
            db.Datasets.count(query).exec((err, count)=>{
                if(err) return next(err);
                datasets.forEach(rec=>{
                    rec._canedit = canedit(req.user, rec, canwrite_project_ids);
                });
                res.json({datasets: datasets, count: count});
            });
        });
    });
});

/**
 * @apiGroup Dataset
 * @api {get} /dataset/distinct Query distinct values
 * @apiDescription              Returns all dataset entries accessible to the user has access
 *
 * @apiParam {String} distinct  A field to pull distinct values (can't do multiple)
 * @apiParam {Object} [find]    Optional Mongo query to perform (you need to JSON.stringify)
 * 
 * @apiHeader {String} authorization A valid JWT token "Bearer: xxxxx"
 *
 * @apiSuccess {Object}         List of distinct values
 */
router.get('/distinct', jwt({secret: config.express.pubkey, credentialsRequired: false}), (req, res, next)=>{
    var find = {};
    if(req.query.find) {
        find = JSON.parse(req.query.find);
        //cast_mongoid(find);
    }
    common.getprojects(req.user, function(err, canread_project_ids, canwrite_project_ids) {
        if(err) return next(err);
        db.Datasets
        .find({
            $and: [
                {project: {$in: canread_project_ids}},
                find
            ]
        })
        .distinct(req.query.distinct)
		.exec((err, values)=>{
            if(err) return next(err);
            res.json(values);
        });
    });
});

//mongoose doesn't cast object id on aggregate pipeline .. https://github.com/Automattic/mongoose/issues/1399
//somewhat futile attempt to convert all string that looks like objectid to objectid.
function cast_mongoid(node) {
    for(var k in node) {
        var v = node[k];
        if(v === null) continue;
        if(typeof v == 'string' && mongoose.Types.ObjectId.isValid(v)) node[k] = mongoose.Types.ObjectId(v);
        if(typeof v == 'object') cast_mongoid(v); //recurse
    }
}

/**
 * @apiGroup Dataset
 * @api {get} /dataset/inventory
 * @apiParam {Object} [find]    Optional Mongo query to perform (you need to JSON.stringify)
 *                              Get counts of unique subject/datatype/datatype_tags. 
 * @apiSuccess {Object}         Object containing counts
 * 
 */
//warning.. similar code in pub.js
router.get('/inventory', jwt({secret: config.express.pubkey, credentialsRequired: false}), (req, res, next)=>{
    var find = {};
    if(req.query.find) {
        find = JSON.parse(req.query.find);
        cast_mongoid(find);
    }
    common.getprojects(req.user, function(err, canread_project_ids, canwrite_project_ids) {
        if(err) return next(err);
        db.Datasets.aggregate()
        .match({ 
            $and: [
                {project: {$in: canread_project_ids}},
                find,
                //{removed: false, project: mongoose.Types.ObjectId("592dcc5b0188fd1eecf7b4ec")},
            ]
        })
        .group({_id: {
            "subject": "$meta.subject", 
            "datatype": "$datatype", 
            "datatype_tags": "$datatype_tags"
        }, count: {$sum: 1}, size: {$sum: "$size"} })
        .sort({"_id.subject":1})
        .exec((err, stats)=>{
            if(err) return next(err);
            res.json(stats);
        });
    });
});

/**
 * @apiGroup Dataset
 * @api {get} /dataset/prov/:id     Get provenance
 * @apiDescription                  Get provenance graph info
 *
 */
router.get('/prov/:id', (req, res, next)=>{
    let datatypes = {};
    let nodes = [];
    let edges = [];

    //starting from the dataset ID specified, walk back through dataset prov & task deps all the way to the 
    //original input datasets

    function load_task(id, cb) {
        request.get({
            url: config.wf.api+"/task/"+id,
            json: true,
            //task/:id api is now public.. but in case we might change our mind.. just send jwt
            headers: {
                authorization: req.headers.authorization, 
            }
        }, (err, _res, task)=>{
            if(err) return cb(err);
            cb(null, task);
        });
    }

    function compose_label(task) {
        let label = task.service; //task.name is sometime like "brainlife.process"..
        if(task.service_branch) label += "("+task.service_branch+")";
        label+="\n"; //task.name is sometime like "brainlife.process"..
        for(let id in task.config) {
            if(id[0] == "_") continue;
            let v = task.config[id];
            let vs = v?v.toString():'(null)';
            //TODO - better way to grab only the non-dataset inputs?
            if(vs.indexOf("..") != 0) label += id+":"+vs+"\n";
        }
        return label;
    }

    let datasets_analyzed = [];
    function load_dataset_prov(dataset, defer, cb) {

        let to = "dataset."+dataset._id;
        if(defer) to = defer.to;
        
        if(!dataset.prov.task) {
            //leaf dataset.. we are done!
            if(defer) {
                //but we have defer.. so add it for the last time
                add_node(defer.node);
                edges.push(defer.edge);
            }
            return cb();
        } 

        load_task(dataset.prov.task._id, (err, task)=>{
            if(err) return cb(err);
            if(task.service == "soichih/sca-product-raw" || task.service == "soichih/sca-service-noop") { //TODO might change in the future
                if(defer) {
                    add_node(defer.node);
                    if(defer.edge.to != defer.edge.from) edges.push(defer.edge);
                }
                if(dataset.prov.subdir) load_product_raw(to, dataset.prov.subdir, cb);
                else load_product_raw(to, dataset._id, cb);
            } else if(task.service && task.service.indexOf("brain-life/validator-") === 0) { 
                if(defer) {
                    add_node(defer.node);
                    if(defer.edge.to != defer.edge.from) edges.push(defer.edge);
                }
                cb(); //ignore validator
            } else {
                //should be a normal task..
                add_node({
                    id: "task."+task._id, 
                    label: compose_label(task),
                });
                edges.push({
                    from: "task."+task._id,
                    to,
                    arrows: "to",
                    label: datatypes[dataset.datatype].name+" "+dataset.datatype_tags.join(","),
                });
                load_task_prov(task, cb);
            }
        });
    }

    function load_product_raw(to, dataset_id, cb) {
        //staging task should be shown as dataset input.. 
        if(~datasets_analyzed.indexOf(dataset_id.toString())) {
            //dataset already analyzed.. just add edge
            var found = false;
            var from = "dataset."+dataset_id;
            var found = edges.find(e=>(e.from == from && e.to == to));
            if(to != from && !found) edges.push({ from, to, arrows: "to", });
            return cb();
        }
        datasets_analyzed.push(dataset_id.toString());
        
        db.Datasets
        .findById(dataset_id)
        .populate('prov.app project')
        .exec((err, dataset)=>{
            if(err) return cb(err);
            if(!dataset) {
                logger.warn("no such dataset .. removed?", dataset_id);
                return cb();
            }
            
            //but.. we don't want to show this dataset node yet.. it might be generated by other tasks
            //so, let's create "defer" object and pass it to load_dataset_prov. If it is indeed the edge,
            //then load_dataset_prov will display
            let defer = {
                node: {
                    id: "dataset."+dataset_id, 
                    font: {size: 12, color: "#fff"},
                    label: dataset.project.name+" / "+ dataset.meta.subject + "\n" +datatypes[dataset.datatype].name,
                },
                edge: {
                    from: "dataset."+dataset_id,
                    to,
                    arrows: "to",
                },
                to,
            };
            //logger.debug("defer", defer);
            load_dataset_prov(dataset, defer, cb);
        });
    }

    let tasks_analyzed = [];
    function load_task_prov(task, cb) {
        if(~tasks_analyzed.indexOf(task._id)) return cb();
        tasks_analyzed.push(task._id);

        if(!task.deps) return cb(); //just in case?
        if(!task.config) return cb(); 
        async.eachSeries(task.config._inputs, (input, next_dep)=>{
            if(!input.task_id) return next_dep(); //old task didn't have this set?
            load_task(input.task_id, (err, dep_task)=>{
                if(err) return next_dep(err);
                
                //process uses sca-product-raw to load input datasets
                //instead of showing that, let's *skip* this node back to datasets that it loaded
                //and load their tasks
                if(dep_task.service == "soichih/sca-product-raw") { //TODO might change in the future
                    load_product_raw("task."+task._id, input.dataset_id||input._id||input.subdir, next_dep);
                } else {
                    //task2task
                    let datatype = datatypes[input.datatype];
                    if(!datatype) datatype = {name: "unknown "+input.datatype};
                    add_node({
                        id: "task."+input.task_id,
                        label: compose_label(dep_task),
                    });
                    edges.push({
                        from: "task."+input.task_id,
                        to: "task."+task._id,
                        arrows: "to",
                        label: datatype.name+" "+input.datatype_tags.join(","),
                    });
                    load_task_prov(dep_task, next_dep); //recurse to its deps
                }
            });
        }, cb);
    }

    function add_node(newnode) {
        let ex = nodes.find(node=>{return (node.id == newnode.id);});
        if(!ex) nodes.push(newnode);
    }

    //TODO cache datatype?
    db.Datatypes.find({})
    .exec((err, _datatypes)=>{
        if(err) return cb(err);
        _datatypes.forEach(_datatype=>{
            datatypes[_datatype._id] = _datatype;
        });
        
        //start by loading *this dataset*
        db.Datasets
        .findOne({ _id: req.params.id })
        .populate('prov.app')
        .exec((err, dataset)=>{
            if(err) return cb(err);
            if(!dataset) return res.status(404).end();
            nodes.push({
                id: "dataset."+dataset._id, 
            });
            load_dataset_prov(dataset, null, err=>{
                if(err) return next(err);
                res.json({nodes, edges});
            });
        })
    });
});

/**
 * @apiGroup Dataset
 * @api {post} /dataset                 Create new dataset from wf service task
 * @apiDescription                      Make a request to create a new dataset from wf service taskdir
 *
 * @apiParam {String} project           Project ID used to store this dataset under
 * @apiParam {String} task_id           WF service Task ID (of output task)
 * @apiParam {String} output_id         App's output_id that generated this dataset
 * @apiParam {String} [subdir]          Subdirectory where all files are actually stored under the task output
 *
 * @apiParam {String} datatype          Data type ID for this dataset (from Datatypes)
 * @apiParam {String[]} datatype_tags   Datatype tags to set
 * @apiParam {Object} [files]           File mapping to override default file path given by datatype
 *
 * @apiParam {Object} [meta]            Metadata - as prescribed in datatype.meta
 * @apiParam {String} [desc]            Description for this crate
 * @apiParam {String[]} [tags]          List of tags associated with this dataset
 *
 * @apiHeader {String} authorization 
 *                                      A valid JWT token "Bearer: xxxxx"
 * @apiSuccess {Object}                 Dataset created
 *                              
 */
router.post('/', jwt({secret: config.express.pubkey}), (req, res, cb)=>{
    if(!req.body.project) return cb("project id not set");
    if(!req.body.datatype) return cb("datatype id not set");
    if(!req.body.task_id) return cb("task_id not set");
    if(!req.body.output_id) return cb("output_id not set");
	if(!req.body.files) req.body.files = {};
    
	//TODO - files (especially file.dirname) should be validated.

    var task = null;
    var datatype = null;
    var dataset = null;
	var tmpdir = null;
	var cleantmp = null;

    async.series([
        next=>{
            //get the task to archive
            console.log(config.amaretti.api, req.body.task_id);
            request.get({
                url: config.amaretti.api+"/task/"+req.body.task_id, json: true,
                headers: { authorization: req.headers.authorization, }
            }, (err, _res, _task)=>{
                if(err) return next(err);
                if(_res.statusCode != 200) return next("failed to load task "+req.body.task_id);
                const gids = req.user.gids||[];
                if(_task.user_id != req.user.sub && !~gids.indexOf(_task._group_id)) return next("you don't own this task or member of a group "+_task._group_id);
                if(!_task.resource_id) return next("resource_id not set");
                if(_task.status != "finished") return next("task not in finished state");
                
                //make sure user is member of the project selected
                db.Projects.findById(req.body.project, (err, project)=>{
                    if(err) return next(err);
                    if(!project) return next("couldn't find the project");
                    if(!~project.members.indexOf(req.user.sub) && 
                        !~project.admins.indexOf(req.user.sub)) return next("you are not admin/member of this project");
                    task = _task;
                    next();
                });
            });
        },

        next=>{
			//logger.debug("registering new dataset record", req.body.meta);
            let d = {
                user_id: req.user.sub,

                project: req.body.project,
                datatype: req.body.datatype,
                datatype_tags: req.body.datatype_tags,

                desc: req.body.desc,
                tags: req.body.tags||[],

                prov: {
                    task, //TODO - mongo doesn't allow key that contains ".".. I should do something about that.. 

                    //deprecated by prov.task (will be removed)
                    instance_id: task.instance_id,
                    task_id: task._id,
                    
                    output_id: req.body.output_id,
                    subdir: req.body.subdir, //optional
                },
                meta: req.body.meta||{},
            };
            console.log("registering new dataset.................");
            console.dir(d);
            new db.Datasets(d).save((err, _dataset)=>{
                if(err) return next(err);
        		dataset = _dataset;
                logger.debug("created dataset record......................", dataset.toObject());
                //res.json(dataset); 
                next(err);
            });
        },

        next=>{
            logger.debug("transfering data");
            common.archive_task(task, dataset, req.body.files, req.headers.authorization, next);
        },

    ], err=>{
        if(err) return cb(err);
        logger.debug("all done archiving");    
        res.json(dataset); 
	});
});

/**
 * @apiGroup Dataset
 * @api {put} /dataset/:id      Update Dataset
 *                              
 * @apiDescription              Update Dataset
 *
 * @apiParam {String} [desc]    Description for this dataset 
 * @apiParam {String[]} [tags]  List of tags to classify this dataset
 * @apiParam {Object} [meta]    Metadata
 * @apiParam {String[]} [admins]  List of new admins (auth sub)
 *
 * @apiHeader {String} authorization 
 *                              A valid JWT token "Bearer: xxxxx"
 *
 * @apiSuccess {Object}         Updated Dataset
 */
router.put('/:id', jwt({secret: config.express.pubkey}), (req, res, next)=>{
    var id = req.params.id;
    common.getprojects(req.user, function(err, canread_project_ids, canwrite_project_ids) {
        db.Datasets.findById(id, (err, dataset)=>{
            if(err) return next(err);
            if(!dataset) return res.status(404).end();
            if(canedit(req.user, dataset, canwrite_project_ids)) {
                //types are checked by mongoose
                if (req.body.desc) dataset.desc = req.body.desc;
                if (req.body.tags) dataset.tags = req.body.tags;
                if (req.body.meta) dataset.meta = req.body.meta;
                if (req.body.admins) dataset.admins = req.body.admins;
                dataset.save((err)=>{
                    if(err) return next(err);
                    dataset = JSON.parse(JSON.stringify(dataset));
                    dataset._canedit = canedit(req.user, dataset, canwrite_project_ids); //need to recompute with new admin/members list
                    res.json(dataset);
                });
            } else return res.status(401).end("you are not administartor of this dataset");
        });
    });
});

/**
 * @apiGroup Dataset
 * @api {post} /dataset/token    Generate dataset access token
 * @apiDescription              Issues warehouse jwt token that grants access to specified dataset IDs that user has access to
 *
 * @apiParam {String[]} ids     List of dataset IDs to grant access
 * @apiHeader {String} authorization 
 *                              A valid JWT token "Bearer: xxxxx"
 *
 * @apiSuccess {Object}         Object containing jwt: key
*/
router.post('/token', jwt({secret: config.express.pubkey}), (req, res, next)=>{
    common.getprojects(req.user, function(err, canread_project_ids, canwrite_project_ids) {
        if(err) return next(err);
        db.Datasets.find({_id: {$in: req.body.ids}}).exec(function(err, datasets) {
            if(err) return next(err);
            //find dataset ids that user have access to
            var valid_ids = [];
            datasets.forEach(dataset=>{
                if(!dataset) return;
                if(!dataset.storage) return;

                canread_project_ids = canread_project_ids.map(id=>id.toString());
                if(!~canread_project_ids.indexOf(dataset.project.toString())) {
                    //user doesn't have read access to this project
                    return;
                } 

                //all good with this one
                valid_ids.push(dataset._id);
            });

            logger.debug("signing jwt", valid_ids);
            let jwt = jsonwebtoken.sign({
                sub: req.user.sub,
                iss: "warehouse",
                exp: (Date.now() + 1000*3600*24*30)/1000, //30 days should be enough..
                scopes: {
                    datasets: valid_ids,
                },
            }, config.warehouse.private_key, {algorithm: 'RS256'});
            res.json({jwt});
        });
    });
});

function stream_dataset(dataset, res, next) {
    var system = config.storage_systems[dataset.storage];
    var stat_timer = setTimeout(function() {
        logger.debug("timeout while calling stat on "+dataset.storage);
        next("stat timeout - filesystem maybe offline today:"+dataset.storage);
    }, 1000*15);
    system.stat(dataset, (err, stats)=>{
        clearTimeout(stat_timer);
        if(err) return next(err);
        logger.debug("obtaining download stream", dataset.storage);
        system.download(dataset, (err, readstream, filename)=>{
            if(err) return next(err);
            //without attachment, the file will replace the current page (why?)
            res.setHeader('Content-disposition', 'attachment; filename='+filename);
            if(stats) res.setHeader('Content-Length', stats.size);
            else if(dataset.size) res.setHeader('Content-Length', dataset.size);
            logger.debug("sent headers.. commencing download");
            let m = meter();
            readstream.pipe(m).pipe(res);   
            readstream.on('error', err=>{
                //like.. when sftp failed to find a file
                logger.error("failed to pipe", err);
                //this seems to terminate the pipe, but I still can't tell the client that
                //transfer went wrong.. especially if dataset.size is not set..
                readstream.end(); 
            });

            //TODO - "end" seems to work on both jetstream and ssh(dcwan), but is it truely universal? 
            //or do we need to switch to use Promise like upload?
            //readstream.on('end', ()=>{

            res.on('finish', ()=>{
                logger.debug("meter count", m.bytes);
                logger.debug("dataset.size", dataset.size);
                if(!dataset.size) {
                    /* this is not good idea.. as .tar file size might change if versionn of tar get updates
                    logger.debug("updating dataset size based on m.bytes");
                    dataset.size = m.bytes;
                    */
                } else { 
                    if(dataset.size != m.bytes) logger.warn("dataset.size doesn't match bytes transferred..");
                }

                if(!dataset.download_count) dataset.download_count = 1;
                else dataset.download_count++;
                logger.debug("download_count", dataset.download_count);

                dataset.save();
            });
        });
    });
}

//this API allows user to download any files under user's workflow directory
//TODO - since I can't let <a> pass jwt token via header, I have to expose it via URL.
//doing so increases the chance of user misusing the token, but unless I use HTML5 File API
//there isn't a good way to let user download files..
//getToken() below allows me to check jwt token via "at" query.
//Another way to mitigate this is to issue a temporary jwt token used to do file download (or permanent token that's tied to the URL?)
/**
 * @apiGroup Dataset
 * @api {get} /dataset/download/:id Download .tar.gz from dataset archive 
 * @apiDescription              Allows user to download any files from user's resource
 *
 * @apiParam {String} [at]      JWT token - if user can't provide it via authentication header
 *
 * @apiHeader {String} [authorization] A valid JWT token "Bearer: xxxxx"
 *
 */
router.get('/download/:id', jwt({
    secret: config.express.pubkey,
    credentialsRequired: false,
    getToken: function(req) { 
        //load token from req.headers as well as query.at
        if(req.query.at) return req.query.at; 
        if(req.headers.authorization) {
            var auth_head = req.headers.authorization;
            if(auth_head.indexOf("Bearer") === 0) return auth_head.substr(7);
        }
        return null;
    }
}), function(req, res, next) {
    var id = req.params.id;
    logger.debug("download requested dataset "+id);
    if(!req.user) logger.warn("no auth request");
    common.getprojects(req.user, function(err, canread_project_ids, canwrite_project_ids) {
        if(err) return next(err);
        db.Datasets.findById(id).populate('datatype').exec(function(err, dataset) {
            if(err) return next(err);
            if(!dataset) return res.status(404).json({message: "couldn't find the dataset specified"});
            if(!dataset.storage) return next("dataset:"+dataset._id+" doesn't have storage field set");
            
            if(dataset.publications && dataset.publications.length > 0) {
                //this dataset is published .. no need for access control
                //TODO - maybe I should still limit download without correct publication id? (what's the point?)
            } else {
                //unpublished -- need to do access control
                canread_project_ids = canread_project_ids.map(id=>id.toString());
                if(!~canread_project_ids.indexOf(dataset.project.toString())) {
                    return res.status(403).json({message: "you don't have access to the project that the dataset belongs"});
                } 
            }
            
            logger.debug("streaming");
            stream_dataset(dataset, res, next);
        });
    });
});

//this API allows user to download any files under user's workflow directory
//TODO - since I can't let <a> pass jwt token via header, I have to expose it via URL.
//doing so increases the chance of user misusing the token, but unless I use HTML5 File API
//there isn't a good way to let user download files..
//getToken() below allows me to check jwt token via "at" query.
//Another way to mitigate this is to issue a temporary jwt token used to do file download (or permanent token that's tied to the URL?)
/**
 * @apiGroup Dataset
 * @api {get} /dataset/download/safe/:id Download .tar.gz from dataset archive 
 * @apiDescription              Allows user to download any files from user's resource
 *
 * @apiParam {String} [at]      Token generated by this service via /dataset/token with scopes with list of dataset IDs
 *
 * @apiHeader {String} [authorization] A valid JWT token "Bearer: xxxxx"
 *
 */
router.get('/download/safe/:id', jwt({
    secret: config.warehouse.public_key,
    credentialsRequired: false,
    getToken: function(req) { 
        //load token from req.headers as well as query.at
        if(req.query.at) return req.query.at; 
        if(req.headers.authorization) {
            var auth_head = req.headers.authorization;
            if(auth_head.indexOf("Bearer") === 0) return auth_head.substr(7);
        }
        return null;
    }
}), function(req, res, next) {
    var id = req.params.id;
    //console.dir(req.user);
    if(!req.user || !req.user.scopes || !req.user.scopes.datasets) return res.status(404).json({message: "no datasets scope"});
    if(!~req.user.scopes.datasets.indexOf(id)) return res.status(404).json({message: "not authorized"});
    logger.debug("token check ok.. loading dataset info");
    db.Datasets.findById(id).populate('datatype').exec((err, dataset)=>{
        if(err) return next(err);
        if(!dataset) return res.status(404).json({message: "couldn't find the dataset specified"});
        if(!dataset.storage) return next("dataset:"+dataset._id+" doesn't have storage field set");
        stream_dataset(dataset, res, next);
    });
});

/**
 * @apiGroup Dataset 
 * @api {delete} /dataset/:id   Hide dataset from dataset results (DEPRECATED USE (post)/delete)
 * @apiDescription              Logically remove dataset by setting "removed" to true 
 *
 * @apiHeader {String} authorization 
 *                              A valid JWT token "Bearer: xxxxx"
 */
//DEPRECATED!
router.delete('/:id', jwt({secret: config.express.pubkey}), function(req, res, next) {
    const id = req.params.id;
    common.getprojects(req.user, function(err, canread_project_ids, canwrite_project_ids) {
        if(err) return next(err);
        db.Datasets.findById(id, function(err, dataset) {
            if(err) return next(err);
            if(!dataset) return next(new Error("can't find the dataset with id:"+id));
            if(canedit(req.user, dataset, canwrite_project_ids)) {
                dataset.remove_date = new Date();
                dataset.removed = true;
                dataset.save(function(err) {
                    if(err) return next(err);
                    res.json({status: "ok"});
                }); 
            } else return res.status(401).end();
        });
    });
});

/**
 * @apiGroup Dataset
 * @api {post} /dataset/delete
 *                              Remove (hide) dataset from dataset results (async)
 * @apiParam {String[]} id      Dataset ID to remove (could be an array)
 *
 * @apiHeader {String} authorization 
 *                              A valid JWT token "Bearer: xxxxx"
 */
router.post('/delete', jwt({secret: config.express.pubkey}), function(req, res, next) {
    let ids = req.body.id;
    if(!Array.isArray(ids)) ids = [ ids ];
    common.getprojects(req.user, function(err, canread_project_ids, canwrite_project_ids) {
        if(err) return next(err);
        db.Datasets.find({_id: {$in: ids}}, (err, datasets)=>{
            if(err) return next(err);
            res.json({status: "ok", "message": "removing "+datasets.length+" datasets"});
            async.eachSeries(datasets, (dataset, next_dataset)=>{
                if(canedit(req.user, dataset, canwrite_project_ids)) {
                    dataset.remove_date = new Date();
                    dataset.removed = true;
                    dataset.save(next_dataset);
                }
            }, err=>{
                if(err) return next(err);
                logger.debug("done removing datasets");
            });
        });
    });
});

/*
router.post('/ds/issue', jwt({secret: config.express.pubkey}), (req, res, next)=>{
    common.getprojects(req.user, function(err, canread_project_ids, canwrite_project_ids) {
        if(err) return next(err);
        console.dir(req.body.ids);
        db.Datasets.find({
            $and: [
                {project: {$in: canread_project_ids}},
                {_id: {$in: req.body.ids}},
            ]
        })
        .select('_id')
		.exec((err, datasets)=>{
            if(err) return next(err);
            let ids = [];
            datasets.forEach(dataset=>{
                ids.push(dataset._id);
            });
            new db.Downscripts({ids}).save((err, _ds)=>{
                if(err) return next(err);
                res.json({id: _ds._id});
            });
        });
    });
});
*/ 

/**
 * @apiGroup Dataset
 * @api {post} /dataset/ds/:id  Generate dataset download script
 * @apiDescription              Generate shell script that can download specified set of datasets.
 *                              It g
 *
 * @apiParam {Object} [find]    Optional Mongo query to perform (you need to JSON.stringify)
 * @apiParam {String[]} [datatype_tags]  
 *                              List of datatype tags to filter (you can use exclusion tags also)
 *
 * @apiSuccess {String}         generated bash shell script
*/
/*
router.post('/downscript', jwt({
    secret: config.express.pubkey,
    getToken: function(req) { 
        //load token from req.headers as well as query.at
        if(req.body.at) return req.body.at; 
        if(req.headers.authorization) {
            var auth_head = req.headers.authorization;
            if(auth_head.indexOf("Bearer") === 0) return auth_head.substr(7);
        }
        return null;
    }
}), function(req, res, next) {
*/
router.post('/downscript', jwt({secret: config.express.pubkey}), function(req, res, next) {
//    var skip = req.query.skip||0;
//    let limit = req.query.limit||100; //this means if user set it to "0", no limit
    common.getprojects(req.user, (err, canread_project_ids, canwrite_project_ids)=>{
        if(err) return next(err);
        db.Datasets.find(construct_dataset_query(req.body, canread_project_ids))
        .populate('datatype')
//        .populate(req.query.populate || '') //all by default
//        .select(req.query.select)
//        .limit(+limit)
//        .skip(+skip)
//        .sort(req.query.sort || '_id')
		.lean()
		.exec((err, datasets)=>{
            if(err) return next(err);
            let script = "#!/bin/bash\n";
            script += "auth=\"Authorization: "+req.headers.authorization+"\"\n"
            datasets.forEach(dataset=>{
                //construct a path to put the datasets in
                let path=".";
                if(dataset.meta.subject) path += "/sub-"+dataset.meta.subject;
                if(dataset.meta.session) path += "/sess-"+dataset.meta.session;
                path+="/"+dataset.datatype.name.replace(/\//g, '-');
                dataset.datatype_tags.forEach(tag=>{
                    path+="."+tag;
                });

                //create mix id and run together.. to make sure each dataset is unique
                path += "/id-"+dataset._id;
                if(dataset.meta.run) path += "_run-"+dataset.meta.run;

                script += "echo downloading dataset:"+dataset._id+" to "+path+"\n";
                script += "mkdir -p "+path+"\n";
                script += "echo \""+JSON.stringify(dataset).replace().replace(/\"/g, '\\"')+"\" > "+path+"/_dataset.json\n";
                script += "curl -H \"$auth\" "+config.warehouse.api+"/dataset/download/"+dataset._id+" | tar -C "+path+" -x\n";

                //Create BIDS symlinks
                let bidspath = "bids/derivatives";
                let pipeline = null;
                if(dataset.prov && dataset.prov.task) pipeline = dataset.prov.task.service;
                //TODO this seems very brittle..
                if(pipeline == "soichih/sca-product-raw" || pipeline == "soichih/sca-service-noop" || ~pipeline.indexOf("brain-life/validator-")) {
                    pipeline = "upload";
                } else {
                    pipeline = pipeline.replace(/\//g, '.');
                }
                logger.debug("pipeline................", pipeline);
                bidspath += "/"+pipeline;
                if(dataset.meta.subject) bidspath += "/sub-"+dataset.meta.subject;
                if(dataset.meta.session) bidspath += "/ses-"+dataset.meta.session;

                let modality = null;
                let maps = null; //null means just link the entire directory
                
                //TODO I will store this info on datatype record once I know what I need to store
                switch(dataset.datatype.name) {
                case "neuro/dtiinit":
                    modality = "dwi";
                    maps = [
                        {"src": "dwi_aligned*.nii.gz", "dest": "dwi.nii.gz"},
                        {"src": "dwi_aligned*.bvecs", "dest": "dwi.bvecs"},
                        {"src": "dwi_aligned*.bvals", "dest": "dwi.bvals"},
                        {"json": "dwi.json"},
                    ];
                    break;
                case "neuro/dwi":
                    modality = "dwi";
                    maps = [
                        {"src": "dwi.nii.gz", "dest": "dwi.nii.gz"},
                        {"src": "dwi.bvecs", "dest": "dwi.bvecs"},
                        {"src": "dwi.bvals", "dest": "dwi.bvals"},
                        {"json": "dwi.json"},
                    ];
                    break;
                case "neuro/track":
                    modality = "dwi";
                    maps = [
                        { "src": "track.tck", "dest": "tractography.tck",},
                        {"json": "tractography.json" },
                    ];
                    break;
                case "neuro/anat/t1w":
                    modality = "anat";
                    maps = [
                        {"src": "t1.nii.gz", "dest": "t1.nii.gz"},
                        {"json": "t1.json" },
                    ];
                    break;
                case "neuro/recon":
                    modality = "dwi";
                    maps = [
                        {"src": "fa.nii.gz", "dest": "type-fa_mask.nii.gz"},
                        {"json": "recon.json" },
                    ];
                    break;
                }

                //figure out how to get out of bids directory and point back to the root
                let symlink_recovery="";
                path.split("/").forEach(depth=>{
                    symlink_recovery += "../";
                });
                symlink_recovery+=path;

                if(!maps) {
                    /* let's output only datatypes that are defined in BIDS spec - rest can be accessed natively
                    //just link the entire raw path under datatype derived name
                    let fakemodality = dataset.datatype.name.replace(/\//g, '-');
                    if(dataset.meta.run) fakemodality += "_run-"+dataset.meta.run;
                    script += "mkdir -p "+bidspath+"\n";
                    script += "ln -s "+symlink_recovery+" "+bidspath+"/"+fakemodality+"\n"; //link the whole directory (can windows do this?)
                    */
                } else {
                    bidspath+="/"+modality;
                    script += "mkdir -p "+bidspath+"\n";
                    maps.forEach(map=>{
                        if(map.json) {
                            let json = {
                                config: dataset.prov.task.config, //TODO always wants configs?
                            };
                            script += "echo \""+JSON.stringify(json).replace().replace(/\"/g, '\\"')+"\" > "+bidspath+"/"+map.json+"\n";
                        } else {
                            script += "ln -s "+"../"+symlink_recovery+"/"+map.src+" "+bidspath+"/"+map.dest+"\n";
                        }
                    });
                }

                script+="\n";
            });
            res.send(script);
        });
    });
});

module.exports = router;


