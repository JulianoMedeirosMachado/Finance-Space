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
            <label class="switch">
            <input :checked="!isDark" id="checkbox" type="checkbox" @change="toggleDark()">
            <span class="slider">
                <div class="star star_1"></div>
                <div class="star star_2"></div>
                <div class="star star_3"></div>
                <svg viewBox="0 0 16 16" class="cloud_1 cloud">
                <path
                    transform="matrix(.77976 0 0 .78395-299.99-418.63)"
                    fill="#fff"
                    d="m391.84 540.91c-.421-.329-.949-.524-1.523-.524-1.351 0-2.451 1.084-2.485 2.435-1.395.526-2.388 1.88-2.388 3.466 0 1.874 1.385 3.423 3.182 3.667v.034h12.73v-.006c1.775-.104 3.182-1.584 3.182-3.395 0-1.747-1.309-3.186-2.994-3.379.007-.106.011-.214.011-.322 0-2.707-2.271-4.901-5.072-4.901-2.073 0-3.856 1.202-4.643 2.925"
                ></path>
                </svg>
            </span>
            </label>
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

.logo-nav-div, .nav-text, .mode-switch-div {
  flex: 1;
  display: flex;
  align-items: center;
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

/* From Uiverse.io by JustCode14 */ 
/* Theme Switch */
/* The switch - the box around the slider */
.switch {
  font-size: 17px;
  position: relative;
  display: inline-block;
  width: 4em;
  height: 2.2em;
  border-radius: 30px;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
}

/* Hide default HTML checkbox */
.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

/* The slider */
.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #2a2a2a;
  transition: 0.4s;
  border-radius: 30px;
  overflow: hidden;
}

.slider:before {
  position: absolute;
  content: "";
  height: 1.2em;
  width: 1.2em;
  border-radius: 20px;
  left: 0.5em;
  bottom: 0.5em;
  transition: 0.4s;
  transition-timing-function: cubic-bezier(0.81, -0.04, 0.38, 1.5);
  box-shadow: inset 8px -4px 0px 0px #fff;
}

.switch input:checked + .slider {
  background-color: #00a6ff;
}

.switch input:checked + .slider:before {
  transform: translateX(1.8em);
  box-shadow: inset 15px -4px 0px 15px #ffcf48;
}

.star {
  background-color: #fff;
  border-radius: 50%;
  position: absolute;
  width: 5px;
  transition: all 0.4s;
  height: 5px;
}

.star_1 {
  left: 2.5em;
  top: 0.5em;
}

.star_2 {
  left: 2.2em;
  top: 1.2em;
}

.star_3 {
  left: 3em;
  top: 0.9em;
}

.switch input:checked ~ .slider .star {
  opacity: 0;
}

.cloud {
  width: 3.5em;
  position: absolute;
  bottom: -1.4em;
  left: -1.1em;
  opacity: 0;
  transition: all 0.4s;
}

.switch input:checked ~ .slider .cloud {
  opacity: 1;
}

.mode-switch-div {
    display: flex;
    justify-content: center;
    align-content: center;
    flex-wrap: wrap;
}
</style>
<script setup>
    import { useDark, useToggle } from '@vueuse/core';
    import { watch } from 'vue';

    const isDark = useDark({ disableTransition: false});
    const toggleDark = useToggle(isDark);

    watch(isDark, (value) => {
        document.body.classList.toggle('dark', value);
        document.body.classList.toggle('light', !value);
    });
</script>