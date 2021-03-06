/**
 * Copyright © 2017, Ambroise Maupate
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is furnished
 * to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
 * OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 *
 * @file Pjax.js
 * @author Adrien Scholaert
 */

import Utils from '../utils/Utils'
import Dispatcher from '../dispatcher/Dispatcher'
import {
    CONTAINER_READY,
    AFTER_PAGE_LOAD,
    AFTER_DOM_APPENDED,
    TRANSITION_START,
    TRANSITION_COMPLETE,
    BEFORE_PAGE_LOAD
} from '../types/EventTypes'
import AbstractBootableService from '../abstracts/AbstractBootableService'
import DefaultTransition from '../transitions/DefaultTransition'
import { debug } from '../utils/Logger'

/**
 * Pjax.
 */
export default class Pjax extends AbstractBootableService {
    constructor (container, serviceName = 'Pjax') {
        super(container, serviceName, ['Dom', 'Config', 'History', 'PageBuilder'])

        debug(`☕️ ${serviceName} awake`)

        /**
         * Indicate if there is an animation in progress.
         *
         * @readOnly
         * @type {Boolean}
         */
        this.transitionProgress = false

        // Bind methods
        this.onNewPageLoaded = this.onNewPageLoaded.bind(this)
        this.onTransitionEnd = this.onTransitionEnd.bind(this)
        this.onLinkClick = this.onLinkClick.bind(this)
        this.onStateChange = this.onStateChange.bind(this)
    }

    /**
     * Init the events.
     *
     * @private
     */
    boot () {
        super.boot()

        const wrapper = this.getService('Dom').getWrapper()
        wrapper.setAttribute('aria-live', 'polite')

        this.currentState = this.getService('History').add(this.getCurrentUrl(), null, 'static')

        this.bindEvents()
    }

    /**
     * Attach event listeners.
     *
     * @private
     */
    bindEvents () {
        document.addEventListener('click', this.onLinkClick)
        window.addEventListener('popstate', this.onStateChange)
    }

    /**
     * Return the currentURL cleaned.
     *
     * @return {String} currentUrl
     */
    getCurrentUrl () {
        // TODO, clean from what? currenturl do not takes hash..
        return Utils.cleanLink(Utils.getCurrentUrl())
    }

    /**
     * Change the URL with push state and trigger the state change.
     *
     * @param {String} url
     * @param {String} transitionName
     */
    goTo (url, transitionName) {
        const currentPosition = window.scrollY
        window.history.pushState(null, null, url)
        window.scrollTo(0, currentPosition)
        this.onStateChange(transitionName, true)
    }

    /**
     * Force the browser to go to a certain url.
     *
     * @param {String} url
     * @private
     */
    forceGoTo (url) {
        window.location = url
    }

    /**
     * Load an url, will start an ajax request or load from the cache.
     *
     * @private
     * @param  {String} url
     * @return {Promise}
     */
    load (url) {
        const deferred = Utils.deferred()

        // Check cache
        let request = null

        if (this.hasService('CacheProvider')) {
            request = this.getService('CacheProvider').get(url)
        }

        // If no cache, make request
        if (!request) {
            let serviceWorker = null

            if (this.hasService('Worker')) {
                serviceWorker = this.getService('Worker')
            }

            request = Utils.request(url, serviceWorker)

            // If cache provider, cache the request
            if (this.hasService('CacheProvider')) {
                this.getService('CacheProvider').set(url, request)
            }
        }

        // When data are loaded
        request
            .then(async data => {
                const container = this.getService('Dom').parseResponse(data)

                // Dispatch an event
                Dispatcher.commit(AFTER_PAGE_LOAD, {
                    container,
                    currentHTML: this.getService('Dom').currentHTML
                })

                // Add new container to the DOM
                this.getService('Dom').putContainer(container)

                // Dispatch an event
                Dispatcher.commit(AFTER_DOM_APPENDED, {
                    container,
                    currentHTML: this.getService('Dom').currentHTML
                })

                // Build page
                const page = await this.getService('PageBuilder').buildPage(container)

                deferred.resolve(page)
            })
            .catch((err) => {
                console.error(err)
                this.forceGoTo(url)
                deferred.reject()
            })

        return deferred.promise
    }

    /**
     * Get the .href parameter out of a link element
     *
     * @private
     * @param  {HTMLElement} el
     * @return {String|undefined} href
     */
    getHref (el) {
        if (!el) {
            return undefined
        }

        // Check if has a href and if it's a link element
        if (typeof el.href === 'string' && el.tagName.toUpperCase() === 'A') {
            return el.href
        }

        return undefined
    }

    /**
     * Get transition name from HTMLElement attribute (data-transition).
     *
     * @param {HTMLElement} el
     * @returns {String|undefined} The transition name
     */
    getTransitionName (el) {
        if (!el) {
            return null
        }

        if (el.getAttribute && typeof el.getAttribute('data-transition') === 'string') {
            return el.getAttribute('data-transition')
        }

        return null
    }

    /**
     * Callback called from click event.
     *
     * @private
     * @param {MouseEvent} evt
     */
    onLinkClick (evt) {
        /**
         * @type {HTMLElement|Node|EventTarget}
         */
        let el = evt.target

        // Go up in the node list until we
        // find something with an href
        while (el && !this.getHref(el)) {
            el = el.parentNode
        }

        if (this.preventCheck(evt, el)) {
            evt.preventDefault()

            this.linkHash = el.hash.split('#')[1]

            const href = this.getHref(el)
            const transitionName = this.getTransitionName(el)
            this.goTo(href, transitionName)
        }
    }

    /**
     * Determine if the link should be followed.
     *
     * @param  {MouseEvent} evt
     * @param  {HTMLElement} element
     * @return {Boolean}
     */
    preventCheck (evt, element) {
        if (!window.history.pushState) { return false }

        const href = this.getHref(element)

        // User
        if (!element || !href) { return false }

        // Middle click, cmd click, and ctrl click
        if (evt.which > 1 || evt.metaKey || evt.ctrlKey || evt.shiftKey || evt.altKey) { return false }

        // Ignore target with _blank target
        if (element.target && element.target === '_blank') { return false }

        // Check if it's the same domain
        if (window.location.protocol !== element.protocol || window.location.hostname !== element.hostname) { return false }

        // Check if the port is the same
        if (Utils.getPort() !== Utils.getPort(element.port)) { return false }

        // Ignore case when a hash is being tacked on the current URL
        // if (href.indexOf('#') > -1)
        //   return false;

        // Ignore case where there is download attribute
        if (element.getAttribute && typeof element.getAttribute('download') === 'string') { return false }

        // In case you're trying to load the same page
        if (Utils.cleanLink(href) === Utils.cleanLink(window.location.href)) { return false }

        return !element.classList.contains(this.getService('Config').noAjaxLinkClass)
    }

    /**
     * Return a transition object.
     *
     * @param  {object} prev historyManager
     * @param  {object} current historyManager
     * @return {AbstractTransition} Transition object
     */
    getTransition (prev, current) {
        if (this.hasService('TransitionFactory')) {
            return this.getService('TransitionFactory').getTransition(prev, current)
        } else {
            return new DefaultTransition()
        }
    }

    /**
     * Method called after a 'popstate' or from .goTo().
     *
     * @private
     */
    onStateChange (transitionName = null, isAjax = false) {
        const newUrl = this.getCurrentUrl()

        if (this.transitionProgress) { this.forceGoTo(newUrl) }

        if (this.getService('History').currentStatus().url === newUrl) { return false }

        // If transition name is a string, a link have been click
        // Otherwise back/forward buttons have been pressed
        if (typeof transitionName === 'string' || isAjax) {
            this.currentState = this.getService('History').add(newUrl, transitionName, 'ajax')
        } else {
            this.currentState = this.getService('History').add(newUrl, null, '_history')
        }

        // Dispatch an event to inform that the page is being load
        Dispatcher.commit(BEFORE_PAGE_LOAD, {
            currentStatus: this.getService('History').currentStatus(),
            prevStatus: this.getService('History').prevStatus()
        })

        // Load the page with the new url (promise is return)
        const newPagePromise = this.load(newUrl)

        // Get the page transition instance (from prev and current state)
        const transition = this.getTransition(
            this.getService('History').prevStatus(),
            this.getService('History').currentStatus()
        )

        this.transitionProgress = true

        // Dispatch an event that the transition is started
        Dispatcher.commit(TRANSITION_START, {
            transition: transition,
            currentStatus: this.getService('History').currentStatus(),
            prevStatus: this.getService('History').prevStatus()
        })

        // Start the transition (with the current page, and the new page load promise)
        const transitionPromise = transition.init(
            this.getService('PageBuilder').page,
            newPagePromise
        )

        newPagePromise.then(this.onNewPageLoaded)
        transitionPromise.then(this.onTransitionEnd)
    }

    /**
     * Function called as soon the new page is ready.
     *
     * @private
     * @param {AbstractPage} page
     */
    onNewPageLoaded (page) {
        const currentStatus = this.getService('History').currentStatus()

        // Update body attributes (class, id, data-attributes
        this.getService('Dom').updateBodyAttributes(page)
        // Update the page title
        this.getService('Dom').updatePageTitle(page)
        // Send google analytic data
        Utils.trackGoogleAnalytics()

        // Update the current state
        if (this.currentState && page) {
            if (!this.currentState.data.title && page.metaTitle) {
                this.currentState.data.title = page.metaTitle
            }
        }

        Dispatcher.commit(CONTAINER_READY, {
            currentStatus,
            prevStatus: this.getService('History').prevStatus(),
            currentHTML: this.getService('Dom').currentHTML,
            page
        })
    }

    /**
     * Function called as soon the transition is finished.
     *
     * @private
     */
    onTransitionEnd () {
        this.transitionProgress = false

        if (this.linkHash) {
            window.location.hash = ''
            window.location.hash = this.linkHash

            this.linkHash = null
        }

        Dispatcher.commit(TRANSITION_COMPLETE, {
            currentStatus: this.getService('History').currentStatus(),
            prevStatus: this.getService('History').prevStatus()
        })
    }
}
