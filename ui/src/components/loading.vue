<template>
<transition name="fade">
    <div v-if="show" class="loading-overlay">
        <div class="loading-message">
            <icon name="cog" spin scale="2" style="position: relative; top: -1px; opacity: 0.8; margin-right: 15px;"/> 
            {{message}}
        </div>
    </div>
</transition>
</template>

<script>
import Vue from 'vue'

export default {
    props: [],
    data () {
        return {
            message: "Loading ...",
            show: false,
        }   
    },
    mounted: function() {               
        this.$root.$on("loading", opt=>{
            if(opt.message) this.message = opt.message;
            if(opt.show == undefined) opt.show = true;
            this.show = opt.show;
        });
    },
    methods: {
        close: function() {
            this.closed = true;
        }
    },
}
</script>
<style scoped>
.loading-overlay {
position: fixed;
top: 0;
bottom: 0;
left: 0;
right: 0;
background-color: #0004;
z-index: 10;
}
.loading-message {
text-align: center;
color: #0009;
font-size: 120%;
text-shadow: 0px 0px 5px #fff;
padding: 30px;
margin: 25%;
background-color: #fffa;
box-shadow: 0 0 8px #0006;
}
.fade-enter-active, .fade-leave-active {
  transition: opacity .5s;
}
.fade-enter, .fade-leave-to /* .fade-leave-active below version 2.1.8 */ {
  opacity: 0;
}
</style>
