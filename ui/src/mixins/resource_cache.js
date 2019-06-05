'use strict';

import Vue from 'vue'

import cache from '@/mixins/cache'

export default {
    mixins: [ cache ], 
    methods: {
        resource_cache: function(id, cb) {
            let cached_resource = this.get_cache(id);
            if(cached_resource) cb(null, cached_resource);
            else {
                console.log("no cache.. loading "+id);
                this.$http.get(Vue.config.amaretti_api+'/resource/'+id, {params: {
                    //populate: 'inputs.datatype outputs.datatype',
                }}).then(res=>{
                    let resource = res.data;
                    this.set_cache(id, resource);
                    cb(null, resource);
                }).catch(cb);
            }
        },  
    }
}

