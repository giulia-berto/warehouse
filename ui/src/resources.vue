<template>
<div>
    <div class="page-content" ref="scrolled">
        <div class="header">
            <b-container>
                <h2>Resources</h2>
                <p style="opacity: 0.7;">
                    You can run Apps on the following computing resources. To register your own resources, please see <a href="https://brainlife.io/docs/resources/register/" target="doc">Registering Resources</a>.
                </p>
            </b-container>
        </div>

        <div v-if="my_resources.length > 0">
            <h4 class="header-sticky"><b-container>My Resources</b-container></h4> 
            <b-container>
                <b-row no-gutters>
                <b-col cols="6" v-for="resource in my_resources" :key="resource._id">
                    <resource class="resource" :resource="resource"/>
                </b-col>
                </b-row>
            </b-container>
        </div>
        <br>
        <br>

        <h4 class="header-sticky"><b-container>Shared Resources</b-container></h4> 
        <b-container>
            <p>
                <small>The following resources are shared among all Brainlife users.</small>
            </p>
            <b-row no-gutters>
            <b-col cols="6" v-for="resource in shared_resources" :key="resource._id">
                <resource class="resource" :resource="resource"/>
            </b-col>
            </b-row>
        </b-container>
        <br>
        <br>
        <br>
        <br>

        <b-button v-if="config.has_role('resource.create', 'amaretti')" class="button-fixed" @click="newresource">
            New Resource
        </b-button>
    </div><!--page-content-->
</div>
</template>

<script>

import Vue from 'vue'
import Router from 'vue-router'

import PerfectScrollbar from 'perfect-scrollbar'
import VueMarkdown from 'vue-markdown'

import pageheader from '@/components/pageheader'
import contact from '@/components/contact'
import tags from '@/components/tags'
import resource from '@/components/resource'

export default {
    components: { 
        pageheader, contact, tags, resource,
    },

    data () {
        return {
            resources: null,

            //for selected item
            apps: [], //apps that uses selected datatype
            adhoc_datatype_tags: [], //datatype tags associated with selected datatype

            //sample_task: null,
            sample_datasets: [],
            
            //editing: false, 
            config: Vue.config,
        }
    },

    computed: {
        my_resources() {
            if(!this.resources) return [];
            return this.resources.filter(r=>r._canedit);
        },
        shared_resources() {
            if(!this.resources) return [];
            return this.resources.filter(r=>(r.gids && r.gids.length > 0)); 
        },
    },

    mounted() {
        let find = JSON.stringify({
            status: {$ne: "removed"},
            //active: true,
        });
        this.$http.get(Vue.config.amaretti_api+'/resource', {params: {
            find, 
            select: 'resource_id config.desc config.maxtask name citation status status_msg lastok_date active gids stats'
        }}).then(res=>{
            this.resources = res.data.resources;
        }).catch(console.error);
    },

    methods: {
        /*
        back() {
            //this.$router.push('/apps');
            this.$router.go(-1);
        },
        open_sample_dataset(dataset_id) {
            //this.$router.replace('/project/'+this.project._id+'/dataset/'+dataset_id);
            this.$root.$emit('dataset.view', {id: dataset_id,  back: './'});
        },
        */

        /*
        open(resource) {
            this.$router.push('/resource/'+resource._id);
        },
        */

        newresource() {
            this.$router.push('/resource/_/edit');
        },
    }, //methods
}
</script>

<style scoped>
.page-content {
top: 0px;
}
.page-content h2 {
margin-bottom: 0px;
padding: 10px 0px;
font-size: 20pt;
}
.page-content h3 {
background-color: white;
color: gray;
padding: 20px;
margin-bottom: 0px;
}
.page-content h4 {
padding: 15px 20px;
background-color: white;
opacity: 0.8;
color: #999;
font-size: 17pt;
font-weight: bold;
}
.header {
padding: 10px;
background-color: white;
border-bottom: 1px solid #eee;
}
h4.header-sticky {
position: sticky;
top: 0px;
z-index: 2;
box-shadow: 0 0 1px #ccc;
padding-top: 12px;
height: 50px;
}
.resource {
margin-bottom: 5px;
margin-right: 5px;
box-shadow: 2px 2px 3px rgba(0,0,0,0.1);
}
</style>

