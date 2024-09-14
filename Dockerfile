FROM redmica/redmica:3.0.2

ARG PLUGINS_DIR=/usr/src/redmine/plugins
ARG THEMES_DIR=/usr/src/redmine/themes
ARG CONFIG_DIR=/usr/src/redmine/config

COPY configuration.yml ${CONFIG_DIR}

RUN git clone https://github.com/redmica/redmica_ui_extension.git ${PLUGINS_DIR}/redmica_ui_extension
