#!/bin/bash
# APEX LAUNCH SCRIPT FOR RASPBERRY PI
# Questo script viene lanciato da startx per avviare il browser a pieno schermo

# Disabilita il salvaschermo e il risparmio energetico
xset s off
xset s noblank
xset -dpms

# Nasconde il cursore del mouse (richiede 'unclutter')
unclutter -idle 0.1 -root &

# Avvia il browser "surf" o "chromium" a pieno schermo puntando al server APEX locale
# Surf è molto leggero per lo Zero 2 W
/usr/bin/surf -F http://localhost:3000
