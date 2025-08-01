<template>
  <div>
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
  color: white;
}

#app a {
  all: unset;
}

body {
  background-color: #1F2430;
}
</style>
