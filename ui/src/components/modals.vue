<template>
<div>
    <!--modal that can be called from any view -->
    <dataset/>
    <agreements/>
    <downscript/>

    <!--models only used by project page (TODO - move to project page eventually -->
    <div v-if="config.user">
        <viewselecter/>
        <datasetselecter/>
        <uploader/>
        <instanceselecter/>
        <copytarget/>
        <archiver/>
        <taskinfo/>
        <appsubmit/>
        <importer/>
        <participants/>
        <galauncher/>
    </div>
</div>
</template>

<script>

import Vue from 'vue'

import viewselecter from '@/modals/viewselecter'
import dataset from '@/modals/dataset'
import datasetselecter from '@/modals/datasetselecter'
import uploader from '@/modals/uploader'
import instanceselecter from '@/modals/instanceselecter'
import archiver from '@/modals/archiver'
import agreements from '@/modals/agreements'
import downscript from '@/modals/downscript'
import taskinfo from '@/modals/taskinfo'
import appsubmit from '@/modals/appsubmit'
import copytarget from '@/modals/copytarget'
import importer from '@/modals/importer'
import participants from '@/modals/participants'
import galauncher from '@/modals/galauncher'

export default {
    components: {
        viewselecter, 
        dataset, 
        uploader, 
        datasetselecter, 
        instanceselecter, 
        archiver, 
        agreements, 
        downscript, 
        taskinfo, 
        appsubmit, 
        copytarget, 
        importer, 
        participants,
        galauncher,
    },
    data() {
        return {
            config: Vue.config,
        }
    },
}

</script>


