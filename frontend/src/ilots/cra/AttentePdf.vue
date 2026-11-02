<!-- Création du PDF signé d'un CRA sur le serveur (30 à 60 secondes) : fenêtre d'attente, au-dessus de la page -->
<template>
    <Teleport to="body">
        <div class="cra-attente">
            <div class="cra-attente__boite" role="status">
                <div class="cra-attente__icone">⏳</div>
                <div class="cra-attente__titre">Création du PDF en cours</div>
                <div class="cra-attente__texte">
                    Le fichier PDF n'existe pas sur le serveur et est en cours de création.<br />Veuillez patienter
                    (30-60 secondes)…
                </div>
                <div class="cra-attente__barre"><div class="cra-attente__progression"></div></div>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
.cra-attente {
    position: fixed;
    inset: 0;
    z-index: 99999;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
}
.cra-attente__boite {
    background: white;
    border-radius: 10px;
    padding: 32px 40px;
    text-align: center;
    max-width: 380px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}
.cra-attente__icone {
    font-size: 36px;
    margin-bottom: 14px;
}
.cra-attente__titre {
    font-weight: bold;
    font-size: 15px;
    color: #333;
    margin-bottom: 10px;
}
.cra-attente__texte {
    font-size: 13px;
    color: #666;
    line-height: 1.5;
}
.cra-attente__barre {
    margin-top: 18px;
    height: 4px;
    background: #e0e0e0;
    border-radius: 2px;
    overflow: hidden;
}
.cra-attente__progression {
    height: 100%;
    background: #6a1b9a;
    animation: cra-progression 40s linear forwards;
}
@keyframes cra-progression {
    from {
        width: 0%;
    }
    to {
        width: 95%;
    }
}
</style>
