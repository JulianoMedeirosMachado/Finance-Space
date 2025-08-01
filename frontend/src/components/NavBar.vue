<template>
    <div class="nav-bar">
        <div class="logo-nav-div">
            <img class="logo-nav" src="../assets/logo-final-white.png" alt="Logo" href="blank"/>
        </div>
        <div class="nav-text">
          <router-link to="/dashboard"><p>Painel</p></router-link>
          <router-link to="/cards"><p>Cartões</p></router-link>
          <router-link to="/bank"><p>Contas de Banco</p></router-link>
        </div>
        <div>
            <img class="mode-switch" src="../assets/dia-e-noite.png">
        </div>
    </div>
</template>

<style scoped>
.logo-nav {
    width: 20%;
}

.nav-bar {
    display: flex;
    border-bottom: 1px solid whitesmoke;
    justify-content: flex-start;
}

.nav-text {
    display: flex;
    justify-content: center;
    font-size: 17px;
    align-items: center;
    width: 100%;
}

.nav-text p {
    margin: 0 20px;
    cursor: pointer;
}

.nav-text p:hover {
    color: #42b983;
    transition: color 0.3s ease;
}

.mode-switch {
  width: 15%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: auto;
  margin-top: 4%;
  filter: brightness(0) invert(1);
}
</style>
<script setup lang="ts">



</script>