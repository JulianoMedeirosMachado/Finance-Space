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
        <div class="mode-switch-div">
            <img @click="toggleDark();" class="mode-switch" src="../assets/dia-e-noite.png">
        </div>
    </div>
</template>

<style scoped>
.dark .logo-nav {
    width: 20%;
}

.light .logo-nav {
    width: 20%;
    filter: brightness(0) invert(0);
}

.dark .nav-bar {
    display: flex;
    border-bottom: 1px solid whitesmoke;
    justify-content: flex-start;
}

.light .nav-bar {
    display: flex;
    border-bottom: 1px solid gray;
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

.mode-switch-div {
    display: flex;
    align-items: center;
    justify-content: right;
}

.mode-switch {
    width: 15%;
    margin-top: 0.5%;
    margin-right: 15px;
    cursor: pointer;
}

.dark .mode-switch {
    filter: brightness(0) invert(1);
}


.light .mode-switch {
    filter: brightness(0) invert(0);
}
</style>
<script setup>
    import { useDark, useToggle } from '@vueuse/core';
    import { watch } from 'vue';

    const isDark = useDark({ disableTransition: false });
    const toggleDark = useToggle(isDark);

    watch(isDark, (value) => {
        document.body.classList.toggle('dark', value);
        document.body.classList.toggle('light', !value);
    });
</script>