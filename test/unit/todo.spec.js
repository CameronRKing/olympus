// tailwind
    // class editor
    // component extractor
    // visualizer
    // style pane

// expectThat
    // first, handle common test actions in the DSL
    // then, automatically update components based on test failures using VueParser

// router parser
    // bootstrap
    // add route
    // rename route
    // change component
    // manipulate all those properties of routes that I never use

// store parser
    // bootstrap
    // add item
    // add mutator
    // add action
    // rename/delete/move to|from module for all of these

// store/component integration:
    // see uses of store
    // offer "add to store" from within component
    // push data from component internals to store
    // inline data from store to component internals 

// route/component integration:
    // see what routes this compoent is used in/directly attached to
    // add to new route
    // edit route(s) of current component

// component projection

// unit test integration

// routes tree: generates component AST of all routes for visualizing, searching, and overlaying with live data
// it's easier to see the real structure of the app, and ask where things are used

// developer story: organize files and runtimes via a timeline that lays on top of an image of your app
    // visualize layers of architecture, files in a layer, connections among files
    // e.g., an input-to-output story showing acceptance/unit tests tied to source code && the execution path through the architecture

// component REPL: link directly to live representations, in a browser or in nodejs
    // i.e., expose "this" of a component on command for manipulation from the (terminal? editor?)