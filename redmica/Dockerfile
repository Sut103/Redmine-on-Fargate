FROM redmica/redmica:3.0.2

ARG PLUGINS_DIR=/usr/src/redmine/plugins
ARG THEMES_DIR=/usr/src/redmine/themes
ARG CONFIG_DIR=/usr/src/redmine/config

COPY configuration.yml ${CONFIG_DIR}

RUN git clone https://github.com/redmica/redmica_ui_extension.git ${PLUGINS_DIR}/redmica_ui_extension && \
    git clone https://github.com/agileware-jp/redmine_github.git ${PLUGINS_DIR}/redmine_github && \
    git clone https://github.com/suer/redmine_absolute_dates.git ${PLUGINS_DIR}/redmine_absolute_dates && \
    git clone https://github.com/suer/redmine_japanese_help.git ${PLUGINS_DIR}/redmine_japanese_help && \
    git clone https://github.com/mrliptontea/PurpleMine2.git ${THEMES_DIR}/PurpleMine2
