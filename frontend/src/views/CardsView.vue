<template>
    <div class="dashboard-panels">
        <div class="dashboard-panel dashboard-visaogeral">
            <h2>Cartões Cadastrados</h2>
            <p> PLACEHOLDER </p>
        </div>
    </div>
</template>

<style scoped>

.dashboard-panels {
    display: flex;
    justify-content: space-evenly;
    padding: 20px;
}

.dashboard-panel {
    padding-left: 60px;
    padding-bottom: 30px;
    padding-right: 60px;
    padding-top: 30px;
    border-radius: 10px;
}

.dark .dashboard-panel {
    box-shadow: rgba(151, 201, 255, 0.25) 0px 1px 1px, rgba(137, 169, 241, 0.13) 0px 0px 1px 1px;
}

.light .dashboard-panel {
    box-shadow: rgba(0, 0, 0, 0.5) 0px 1px 1px, rgba(0, 0, 0, 0.144) 0px 0px 1px 1px;
}
</style>