/*
 * Copyright © 2017, Rezo Zero
 *
 * @file app.js
 * @author Adrien Scholaert <adrien@rezo-zero.com>
 * @author Ambroise Maupate <ambroise@rezo-zero.com>
 */

import StartingBlocks, {
    Pjax,
    History,
    Prefetch,
    CacheProvider,
    polyfills
} from 'starting-blocks'
import WebpackAsyncBlockBuilder from './services/WebpackAsyncBlockBuilder'
import Splashscreen from './services/Splashscreen'
import TransitionFactory from './factories/TransitionFactory'
import HomePage from './pages/HomePage'
import ExampleNav from './ExampleNav'
import 'gsap/CSSPlugin'
import 'lazysizes'

(() => {
    // BEING IMPORTANT (Bug Safari 10.1)
    // DO NOT REMOVE
    if (window.MAIN_EXECUTED) {
        throw new Error('Safari 10')
    }

    window.MAIN_EXECUTED = true
    // END IMPORTANT

    /**
     * Declare polyfills
     */
    polyfills()

    /**
     * Build nav
     * @type {ExampleNav}
     */
    const nav = new ExampleNav()

    // console.log(StartingBlocks)

    /**
     * Build a new starting blocks
     */
    const startingBlocks = new StartingBlocks({
        debug: 1
    })

    // Add services
    startingBlocks.provider('TransitionFactory', TransitionFactory)
    startingBlocks.provider('History', History)
    startingBlocks.provider('CacheProvider', CacheProvider)

    // Custom block builder (dynamic import)
    startingBlocks.provider('BlockBuilder', WebpackAsyncBlockBuilder)

    // Add bootable services
    startingBlocks.bootableProvider('Prefetch', Prefetch)
    startingBlocks.bootableProvider('Pjax', Pjax)
    startingBlocks.bootableProvider('Splashscreen', Splashscreen)

    // Register pages
    startingBlocks.instanceFactory('HomePage', c => {
        return new HomePage(c)
    })

    // If you want to use standard block import
    // startingBlocks.instanceFactory('UsersBlock', c => {
    //     return new UsersBlock(c)
    // })

    nav.init()
    startingBlocks.boot()
})()
