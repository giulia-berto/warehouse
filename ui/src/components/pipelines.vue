<template>
<div v-if="ready">
    <div v-if="!editing && nonremoved_rule_count > 0" class="info">
        <!--<span><b>{{nonremoved_rule_count}}</b> Pipeline Rules</span>-->
        <div style="position: fixed; top: 57px; right: 30px; z-index: 1;">
            <small>Order by</small>
            <b-dropdown :text="order" size="sm" :variant="'light'">
                <b-dropdown-item @click="order = 'create_date'">Create Date (new first)</b-dropdown-item>
                <b-dropdown-item @click="order = '-create_date'">Create Date (old first)</b-dropdown-item>
                <b-dropdown-divider></b-dropdown-divider>
                <b-dropdown-item @click="order = 'update_date'">Update Date (new first)</b-dropdown-item>
                <b-dropdown-item @click="order = '-update_date'">Update Date (old first)</b-dropdown-item>
                <b-dropdown-divider></b-dropdown-divider>
                <b-dropdown-item @click="order = '-desc'">Description (a-z)</b-dropdown-item>
                <b-dropdown-item @click="order = 'desc'">Description (z-a)</b-dropdown-item>
            </b-dropdown>
        </div>
    </div>
    <ruleform class="page-content" :value="editing" :new_output_tags="['rule'+rules.length]" v-if="editing" @cancel="cancel_edit" @submit="submit"/>
    <div v-else class="page-content" ref="scrolled">
        <!--list view-->
        <div v-if="nonremoved_rule_count == 0" style="margin: 20px;" >
            <p class="text-muted">Pipeline rules allow you to automate bulk submissions of your processes based on defined criterias.</p>
            <p class="text-muted">This feature could potentially launch a large number of processes. Please read our <a href="https://brainlife.io/docs/user/pipeline/" target="doc">Documentation</a> for more information.</p>
           <iframe width="444" height="250" src="https://www.youtube.com/embed/Ewy3ahCVUzw" frameborder="0" 
                allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

        </div>
        <div class="rules" v-else>
            <div style="padding: 10px 30px">
                <b-row :no-gutters="true">
                    <b-col :cols="5"><!--placeholder--></b-col>
                    <b-col :cols="1">
                        <small>Submitter</small>
                    </b-col>
                    <b-col :cols="2">
                        <small style="width: 100px; float: right;">Tasks</small>
                    </b-col>
                    <b-col :cols="2">
                        <small style="float: right;">Create Date</small>
                    </b-col>
                    <b-col :cols="2">
                        <small style="float: right;">Update Date</small>
                    </b-col>
                </b-row>
            </div>

            <div v-for="rule in sorted_rules.filter(r=>r.removed == false)" :key="rule._id" :id="rule._id" 
                :class="{'rule-removed': rule.removed, 'rule-selected': selected == rule, 'rule-inactive': !rule.active}" class="rule">
                <div class="rule-header" @click="toggle(rule)">
                    <b-row :no-gutters="true">
                        <b-col :cols="5">
                            <div style="display: inline-block; width: 100px; float: left;" @click.stop="">
                                <b-form-checkbox switch v-model="rule.active" name="Online" @change="flip_switch(rule)" :disabled="rule.deactivating">
                                    <b style="position: relative; top: 2px; font-weight: bold;">
                                        <span v-if="rule.active" class="text-primary">Online</span>
                                        <span v-else class="text-secondary">Offline</span>
                                    </b>
                                </b-form-checkbox>
                            </div>
                            <div style="margin-left: 100px;">
                                <span>{{rule.app.name}}</span> <b-badge variant="secondary">{{rule.branch}}</b-badge><br>
                                <span v-if="rule.subject_match" title="Only handle subjects that matches this regex">
                                    <b-badge variant="light">SUBJECT: {{rule.subject_match}}</b-badge>&nbsp;
                                </span>     
                                <span v-if="rule.session_match" title="Only handle session that matches this regex">
                                    <b-badge variant="light">SESSION: {{rule.session_match}}</b-badge>&nbsp;
                                </span>     
                                <small>{{rule.name}}</small>
                            </div>
                        </b-col>
                        <b-col :cols="1">
                            <contact :id="rule.user_id" size="small"/>
                        </b-col>
                        <b-col :cols="2" style="text-align: right;">
                            <stateprogress v-if="rule.stats" :states="rule.stats.tasks" style="float: right; width: 100px"/>
                        </b-col>
                        <b-col :cols="2" style="text-align: right;">
                            <timeago :datetime="rule.create_date" :auto-update="10"/>
                        </b-col>
                        <b-col :cols="2" style="text-align: right;">
                            <timeago :datetime="rule.update_date" :auto-update="10"/>
                        </b-col>
                    </b-row>
                </div>

                <!--rule body-->
                <div v-if="selected == rule" transition="expand">
                    <div class="rule-body">
                        <div class="section-header">
                            <div style="float: right; position: relative; top: -4px;">
                                <div class="button" @click="copy(rule)" v-if="ismember() || isadmin()" size="sm" title="copy"><icon name="copy"/></div>
                                <div class="button" @click="edit(rule)" v-if="ismember() || isadmin()" size="sm" title="edit"><icon name="edit"/></div>
                                <div class="button" @click="remove(rule)" v-if="ismember() || isadmin()" size="sm" title="remove"><icon name="trash"/></div>
                            </div>
                            Submit the following App <small style="opacity: 0.5;">and archive all output datasets to this project</small>
                        </div>
                        <app :app="rule.app" :compact="true" style="margin-left: 10px; margin-bottom: 10px;" :branch="rule.branch||'master'"/>
                        <table class="table table-sm" style="font-size: 85%;">
                        <tbody>
                            <tr v-for="(v,k) in rule.config" :key="k">
                                <th width="20%" style="font-size: 90%; padding-left: 15px; opacity: 0.7">&nbsp;&nbsp;{{k}}</th>
                                <th v-if="typeof v == 'object'" style="word-break: break-word;">
                                    <pre style="margin-bottom: 0px;">{{JSON.stringify(v, null, 4)}}</pre>
                                </th>
                                <th v-else>{{v}}</th>
                            </tr>
                        </tbody>
                        </table>

                        <div class="section-header">
                            For
                            <div style="display: inline-block; width: 400px;">
                                <b-input-group prepend="Subject" size="sm" title="Only process subjects that matches this regex">
                                    <b-form-input v-model="rule.subject_match_edit" type="text" placeholder="(All Subjects)"></b-form-input>

                                    <b-input-group-prepend is-text>Session</b-input-group-prepend>
                                    <b-form-input v-model="rule.session_match_edit" type="text" placeholder="(All Session)"></b-form-input>
                                    <b-input-group-append v-if="rule.session_match != rule.session_match_edit || rule.subject_match != rule.subject_match_edit">
                                        <b-btn variant="primary" @click="update_match(rule)"><icon name="check"/></b-btn>
                                    </b-input-group-append>

                                </b-input-group>
                            </div>
                            <!--<small style="opacity: 0.5">(regex)</small>-->
                            with the following set of archived datasets available
                        </div>
                        <div style="margin-left: 30px;">
                            <p v-for="input in rule.app.inputs" :key="input.id">
                                <small style="float: right; margin-right: 10px;">{{input.id}}</small>
                                <b v-if="rule.input_subject">{{rule.input_subject[input.id]}}</b>
                                <datatypetag :datatype="datatypes[input.datatype]" :tags="all_datatype_tags(rule, input)" v-if="datatypes"/>
                                <span v-if="rule.input_tags && rule.input_tags[input.id] && rule.input_tags[input.id].length > 0" style="opacity: 0.8">
                                    <!--<small class="text-muted">with tags</small> <tags :tags="rule.input_tags[input.id]"/>-->
                                    <small v-for="(tag,idx) in rule.input_tags[input.id]" :key="idx"> | {{tag}}</small>
                                </span>
                                <span v-if="rule.input_project_override && rule.input_project_override[input.id] && projects[rule.input_project_override[input.id]]" class="text-muted">
                                    <icon style="opacity: 0.5; margin: 0 5px" name="arrow-left" scale="0.8"/><small>from</small> <icon name="shield-alt"/> {{projects[rule.input_project_override[input.id]].name}}
                                </span>
                                <span v-if="rule.input_subject && rule.input_subject[input.id]">
                                    <small>use subject:</small> {{rule.input_subject[input.id]}}
                                </span>
                                <span v-if="rule.input_session && rule.input_session[input.id]">
                                    <small>use session:</small> {{rule.input_session[input.id]}}
                                </span>
                                <b v-if="rule.input_selection && rule.input_selection[input.id]">{{rule.input_selection[input.id]}}</b>
                            </p>
                        </div>

                        <div class="section-header">
                            If the following output datasets are missing (and archive when finish)
                        </div>
                        <div style="margin-left: 30px;">
                            <p v-for="output in rule.app.outputs.filter(output=>rule.archive == undefined || rule.archive[output.id] == undefined || rule.archive[output.id].do)" :key="output.id">
                                <small style="float: right; margin-right: 10px">{{output.id}}</small>
                                <datatypetag :datatype="datatypes[output.datatype]" :tags="output.datatype_tags" v-if="datatypes"/>
                                <span class="opacity: 0.7" v-if="rule.output_tags && rule.output_tags[output.id] && rule.output_tags[output.id].length > 0">
                                    <!--<small class="text-muted">with dataset tags of</small> <tags :tags="rule.output_tags[output.id]"/>-->
                                    <small v-for="(tag,idx) in rule.output_tags[output.id]" :key="idx"> | {{tag}}</small>
                                </span>
                            </p>
                        </div>

                        <div class="section-header">Log</div>
                        <rulelog :id="rule._id"/>
                        <br>
                    </div>
                    <br>
                </div>
            </div><!--rule-->
        </div><!--rules-->

        <p style="padding-top: 90px;">&nbsp;</p>
        <b-button v-if="isadmin() || ismember()" @click="newrule" class="button-fixed">
            New Rule
        </b-button>
    </div><!--page-content-->
</div>
</template>

<script>
import Vue from 'vue'

import contact from '@/components/contact'
import tags from '@/components/tags'
import app from '@/components/app'
import datatypetag from '@/components/datatypetag'
import ruleform from '@/components/ruleform'
import rulelog from '@/components/rulelog'
import stateprogress from '@/components/stateprogress'

import appcache from '@/mixins/appcache'

import ReconnectingWebSocket from 'reconnectingwebsocket'

const async = require("async");

var debounce = null;

export default {
    mixins: [ appcache ],
    props: [ 'project' ], 
    components: { 
        contact, tags, app,
        datatypetag, ruleform, rulelog, stateprogress,
    },
    data () {
        return {
            editing: null,
            selected: null,
            order: 'create_date', //default (new > old)

            ready: false,

            rules: null, 
            datatypes: null,
            projects: null,

            ws: null, //websocket

            config: Vue.config,
        }
    },

    mounted() {
        this.load();

        var url = Vue.config.event_ws+"/subscribe?jwt="+Vue.config.jwt;
        if(this.ws) this.ws.close();
        this.ws = new ReconnectingWebSocket(url, null, {/*debug: Vue.config.debug,*/ reconnectInterval: 3000});
        this.ws.onopen = (e)=>{
            this.ws.send(JSON.stringify({
                bind: {
                    ex: "warehouse",
                    key: "rule.*.*."+this.project._id+".#",
                }
            }));
        }

        this.ws.onmessage=(json)=>{
            var event = JSON.parse(json.data);
            if(!event.dinfo) return; //??
            //console.dir(event);
            if(event.dinfo.routingKey.startsWith("rule.update.")) {
                let newrule = event.msg;
                //if(newrule.app._id) alert("feeding app that's already populated");
                this.appcache(newrule.app, {populate_datatype: false}, (err, app)=>{
                    newrule.app = app;
                    let rule = this.rules.find(rule=>rule._id == newrule._id);
                    if(rule) {
                        //update existing rule
                        for(let key in newrule) { 
                            rule[key] = newrule[key]; 
                        }
                    } else {
                        console.error("odd.. couldn't find the rule that we just received update");
                    }

                    //incase we might loaded a new rule with new app..
                    this.load_referenced(err=>{
                        if(err) console.error(err);
                    });
                });
            }
            if(event.dinfo.routingKey.startsWith("rule.create.")) {
                let newrule = event.msg;
                this.appcache(newrule.app, {populate_datatype: false}, (err, app)=>{
                    newrule.app = app;
                    this.rules.push(newrule);

                    //incase we might loaded a new rule with new app..
                    this.load_referenced(err=>{
                        if(err) console.error(err);
                    });
                });
            }
        }
    },

    destroyed() {
        console.log("closing ws");
        if(this.ws) this.ws.close();
    },

    watch: {
        project: function() {
            //console.log("project changed.. need to reload");
            this.load();
        },

        '$route': function() {
            var subid = this.$route.params.subid;
            if(!subid) this.editing = null;
        },
        order: function() {
            let group_id = this.project.group_id;
            window.localStorage.setItem("pipelines.order."+group_id, this.order);
        },

        selected: function() {
            if(!this.selected) return;
            Vue.set(this.selected, 'subject_match_edit', this.selected.subject_match);
            Vue.set(this.selected, 'session_match_edit', this.selected.session_match);
        },
    },

    computed: {

        nonremoved_rule_count() {
            return this.rules.filter(rule=>rule.removed == false).length;    
        },

        sorted_rules() {

            //then sort
            let order = 1;
            let field = this.order;
            if(field[0] == "-") {
                order = -1;
                field = field.substring(1); 
            } 
            return this.rules.sort((a,b)=>{
                switch(field) {
                case "desc":
                    a = a.name?a.name.toUpperCase():"";
                    b = b.name?b.name.toUpperCase():"";
                    break;

                //deprecated
                case "date": 
                    a = a.create_date?new Date(a.create_date):null;
                    b = b.create_date?new Date(b.create_date):null;
                    break;

                case "create_date": 
                    a = a.create_date?new Date(a.create_date):null;
                    b = b.create_date?new Date(b.create_date):null;
                    break;

                case "update_date": 
                    a = a.update_date?new Date(a.update_date):null;
                    b = b.update_date?new Date(b.update_date):null;
                    break;

                default: 
                    throw("no such field");
                }
                if(a < b) return order;
                if(a > b) return -(order);
                return 0;
            });
        },

    },

    methods: {
        load(cb) {
            let group_id = this.project.group_id;
            this.order = window.localStorage.getItem("pipelines.order."+group_id)||"create_date";

            this.ready = false;
            this.$http.get('rule', {params: {
                find: JSON.stringify({
                    project: this.project._id,
                    //removed: false, //I need all rules so that I can get the total count
                }),
                populate: 'app', 
                sort: 'create_date', 
                limit: 500,
            }})
            .then(res=>{
                this.rules = res.data.rules; 
                if(this.$route.params.subid) {
                    this.editing = this.rules.find(rule=>rule._id == this.$route.params.subid);
                }

                //TODO - why is this needed?
                if(this.selected) {
                    this.selected = this.rules.find(rule=>rule._id == this.selected._id); //need to reselect..
                }

                this.load_referenced(err=>{
                    if(err) console.error(err);
                    this.ready = true;
                    if(cb) cb();
                });
            });
        },

        load_referenced(cb) {
            //load referenced datatypes
            let ids = [];
            this.rules.forEach(rule=>{
                rule.app.outputs.forEach(output=>{
                    if(!~ids.indexOf(output.datatype)) ids.push(output.datatype);
                });
                rule.app.inputs.forEach(input=>{
                    if(!~ids.indexOf(input.datatype)) ids.push(input.datatype);
                });
            });
            return this.$http.get('datatype', {params: {
                find: JSON.stringify({
                    _id: {$in: ids}
                }),
                limit: 1000,
            }})
            .then(res=>{
                this.datatypes = {};
                res.data.datatypes.forEach(datatype=>{
                    this.datatypes[datatype._id] = datatype;
                });

                //load projects referenced
                let ids = [];
                this.rules.forEach(rule=>{
                    for(let input_id in rule.input_project_override) {
                        let project_id = rule.input_project_override[input_id];
                        if(!~ids.indexOf(project_id)) ids.push(project_id);
                    } 
                });
                return this.$http.get('project', {params: {
                    find: JSON.stringify({
                        _id: {$in: ids}
                    })
                }})
            })
            .then(res=>{
                this.projects = {};
                res.data.projects.forEach(project=>{
                    this.projects[project._id] = project;
                });
                cb();
            }).catch(cb); 
        },

        isadmin() {
            if(!this.project) return false;
            if(~this.project.admins.indexOf(Vue.config.user.sub)) return true;
            return false;
        },

        ismember() {
            if(!this.project) return false;
            if(~this.project.members.indexOf(Vue.config.user.sub)) return true;
            return false;
        },

        notify_error(err) {
            this.$notify({type: 'error', text: err});
        },

        newrule() {
            //set to default
            this.editing = {
                name: "",
                config: {},
                project: this.project._id,
                active: false,
                removed: false,
            };
            this.$refs.scrolled.scrollTop = 0;
        },

        edit(rule) {
            if(rule.active) return alert("Please stop the rule before editing it");
            this.$router.replace("/project/"+this.project._id+"/pipeline/"+rule._id);
            this.$refs.scrolled.scrollTop = 0;
            this.editing = rule;
            this.selected = rule; //I think it makes sense to select rule that user is editing?
        },

        copy(rule) {
            this.editing = Object.assign({}, rule);
            delete this.editing._id;
            this.editing.name = rule.name+" - copy";
            this.editing.active = false; //should deactivate if it's active

            //reset some things
            delete this.editing.stats;
        },

        update_match(rule) {
            Vue.set(rule, 'subject_match', rule.subject_match_edit);
            Vue.set(rule, 'session_match', rule.session_match_edit);
            this.$http.put('rule/'+rule._id, rule).then(res=>{
                this.$notify({type: "success", text: "Updated filter"});
            }).catch(this.notify_error);
        },

        cancel_edit() {
            this.editing = null;
            this.$router.replace("/project/"+this.project._id+"/pipeline");
            //this.$router.go(-1);
            Vue.nextTick(()=>{
                //scroll to the selected rule (TODO - I think I should delay until animation is over?)
                if(this.selected) {
                    //console.log("searching for ", this.selected._id)
                    var elem = document.getElementById(this.selected._id);
                    this.$refs.scrolled.scrollTop = elem.offsetTop;
                }
            });
        },

        submit(rule) {
            rule.project = this.project._id; //rule editor doesn't set project id.
            if(rule._id) {
                //update
                this.$http.put('rule/'+rule._id, rule).then(res=>{
                    this.load(err=>{
                        this.$notify({text: "Successfully updated a rule", type: "success"});
                        this.cancel_edit();
                    }); 
                }).catch(this.notify_error);
            } else {
                //create
                this.$http.post('rule', rule).then(res=>{
                    this.selected = res.data;
                    this.load(err=>{
                        this.$notify({text: "Successfully created a new rule. You must activate it so that it will run", type: "success"});
                        this.cancel_edit();
                    });
                }).catch(this.notify_error);
            }
        },

        remove(rule) {
            if(rule.active) return alert("Please stop the rule before removing it");
            if(rule.stats && Object.keys(rule.stats.tasks).length > 0) {
                //console.dir(Object.keys(rule.stats.tasks));
                return alert("Please wait until all jobs are removed before removing it.");
            }

            if(confirm("Do you really want to remove this rule?")) {
                this.$http.delete('rule/'+rule._id)
                .then(res=>{
                    rule.removed = true;
                    this.$notify({text: "Removed!", type: "success"});
                });
            }
        },

        toggle(rule) {
            console.log("toggling");
            if(this.selected == rule) {
                this.selected = null;
            } else {
                this.selected = rule;
                Vue.nextTick(()=>{
                    //scroll to the selected rule (TODO - I think I should delay until animation is over?)
                    var elem = document.getElementById(rule._id);
                    this.$refs.scrolled.scrollTop = elem.offsetTop;
                });
            }
        },

        all_datatype_tags(rule, input) {
            let tags = input.datatype_tags;
            if(rule.extra_datatype_tags) tags = tags.concat(rule.extra_datatype_tags[input.id]);
            return tags;
        },
    
        flip_switch(rule) {
            if(rule.active) {
                //deactivate
                Vue.set(rule, 'deactivating', true);
                this.$notify({ title: 'Deactivating', text: 'Deactivating this rule and all tasks submitted from it', type: 'info', });
                this.$http.put('rule/deactivate/'+rule._id).then(res=>{
                    rule.deactivating = false;
                    this.$notify({ title: 'Deactivating', text: 'Successfully deactivated', type: 'success', });
                }).catch(this.notify_error);
            } else {
                //activate
                this.$http.put('rule/'+rule._id, {active: true}).then(res=>{
                    this.$notify({ title: 'Activating', text: 'Successfully activated', type: 'success', });
                }).catch(this.notify_error);
            }

            return true; //stop prop
        },
    
   },
};

</script>

<style scoped>
.rule {
box-shadow: 1px 1px 3px rgba(0,0,0,0.3);
margin: 0px 20px;
transition: margin 0.2s;
background-color: white;
}
.rule:first-child {
margin-top: 2px;
}
.rule.rule-selected {
margin: 0px;
margin-top: 20px;
background-color: #f0f0f0;
margin-bottom: 20px;
box-shadow: none;
}
.rule.rule-selected .rule-header {
margin-bottom: 10px;
background-color: #f0f0f0;
}
.rule.rule-inactive .rule-header {
background-color: #ddd;
}
.rule.rule-inactive {
background-color: #eee;
}
.rule-header {
cursor: pointer;
transition: background-color 0.3s;
padding: 4px 10px;
padding-top: 10px;
font-size: 88%;
}
.rule-header .custom-switch {
top: -2px;   
}
.rule.rule-selected .rule-header {
padding: 15px;
position: sticky;
top: 0px;
z-index: 7; /*make it on top of scrollbar for log view*/
}
.rule-body {
margin-right: 100px; 
background-color: white; 
clear: both;
}
.rule.rule-selected .rule-body {
box-shadow: 2px 2px 3px rgba(0,0,0,0.2);
}
.expand-transition {
  transition: all .3s ease;
  height: 30px;
  padding: 10px;
  background-color: #eee;
  overflow: hidden;
}
.expand-enter, .expand-leave {
  height: 0;
  padding: 0 10px;
  opacity: 0;
}
.rule-header:hover {
cursor: pointer;
background-color: #eee;
}
.info {
top: 100px;
padding: 8px 20px;
color: #999;
background-color: #f9f9f9;
z-index: 1; /*needed to make sort order dropdown box to show up on top of page-content*/
}
.page-content {
overflow-x: hidden; /*i can't figure out why there would be x scroll bar when a rule is active*/
top: 95px;
}
.header, 
.content {
min-width: 500px;
}
.config {
background-color: #f9f9f9;
}
.date {
font-size: 85%;
opacity: 0.5;
}
.section-header {
background-color: #f4f4f4; 
clear: both; 
padding: 10px; 
margin-bottom: 10px;
}
</style>

