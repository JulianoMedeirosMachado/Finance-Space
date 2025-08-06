<template>
  <div id="app">
    <NavBar />
    <RouterView />
  </div>
</template>

<script>
  import NavBar from './components/NavBar.vue'
  export default {
    name: 'App',
    components: {
      NavBar
    }
  }

</script>

<style>
#app {
  font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

#app a {
  all: unset;
}

.dark {
  background-color: #1F2430;
  color: white;
}

.light {
  background-color: #ffff;
  color: black;
}

.light, .dark {
    transition: background-color 1s, color 1s, filter 1s, img 1s;
}
</style>
